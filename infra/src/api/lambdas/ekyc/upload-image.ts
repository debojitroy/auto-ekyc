import {
    Context,
    APIGatewayProxyResultV2,
    APIGatewayProxyWebsocketHandlerV2,
    APIGatewayProxyWebsocketEventV2
} from 'aws-lambda';
import {getItem, updateItem} from "../../../actions/requests/store";
import {uploadFile} from "../../../actions/files/s3";

export interface UploadImageRequest {
    action: string;
    message: {
        tracking_id: string;
        imageType: 'id_front' | 'id_back' | 'selfie' | 'liveliness';
        imageBase64: string;
    }
}

export const eKycUploadImageHandler: APIGatewayProxyWebsocketHandlerV2 = async (event: APIGatewayProxyWebsocketEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    // Read values from env
    const dynamoDbTable = process.env.DYNAMODB_TABLE;
    const s3Bucket = process.env.S3_BUCKET;

    if (!dynamoDbTable || !s3Bucket) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal settings missing',
            }),
        };
    }

    try {
        const connection_id = event.requestContext.connectionId;
        const body = JSON.parse(event.body || '') as UploadImageRequest;

        if (!body || !body.message) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Missing body for request',
                }),
            };
        }

        const {tracking_id, imageType, imageBase64} = body.message;

        if (!tracking_id || !imageType || !imageBase64) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Missing parameters for request',
                }),
            };
        }

        // Get value from DynamoDB
        const item = await getItem(dynamoDbTable, connection_id, tracking_id);

        if (!item) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Tracking ID not found',
                }),
            };
        }

        // Upload file to s3
        const fileKey = `${connection_id}/${tracking_id}/${imageType}.jpg`;
        const fileUploadResult = await uploadFile(s3Bucket, Buffer.from(imageBase64, 'base64'), fileKey, 'image/jpeg', {});

        console.log('File Upload Result: ', fileUploadResult);

        // Update item in DynamoDB
        const updateResult = await updateItem(dynamoDbTable, connection_id, tracking_id, {
            status: {Value: {S: 'UPDATED'}},
            [imageType]: {Value: {S: fileKey}}
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Image uploaded',
                updateResult,
            }),
        }
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                error,
            }),
        };
    }
};