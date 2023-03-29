import {APIGatewayProxyResultV2} from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';
import {S3Client, PutObjectCommand, PutObjectCommandInput} from "@aws-sdk/client-s3";
import {promisify} from "util";
import {v4 as uuid} from "uuid";
import {
    APIGatewayEventRequestContextJWTAuthorizer,
    APIGatewayProxyEventBase
} from "aws-lambda/trigger/api-gateway-proxy";
import {insertItem} from "../../../actions/requests/store";
import {ValidationRequest} from "../../../state-machine/types/triggerInput";
import {AttributeValue} from "@aws-sdk/client-dynamodb";
import {SQSClient, SendMessageCommand} from "@aws-sdk/client-sqs";
import {constants} from "http2";

const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const deleteFileAsync = promisify(fs.unlink);

export interface CreateRequest {
    name: string;
    date_of_birth: string;
    id_number: string;
    id_type: string;
    id_front: string;
    selfie: string;
}

const s3Client = new S3Client({});
const sqsClient: SQSClient = new SQSClient({});
const rootPath = '/tmp';
const saveFileToDisk = async (name: string, base64Image: string) => {
    // Check if folder exists
    const dirname = path.dirname(`${rootPath}/${name}`);

    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, {recursive: true});
    }

    await writeFileAsync(`${rootPath}/${name}`, base64Image, {encoding: 'base64'});
}

const deleteFileFromDisk = async (name: string) => {
    await deleteFileAsync(`${rootPath}/${name}`);
}

const uploadToS3 = async ({
                              bucketName,
                              name,
                              contentType,
                              metadata
                          }: { bucketName: string; name: string, contentType: string, metadata: Record<string, string> }) => {
    const fileContents = await readFileAsync(`${rootPath}/${name}`);

    const params: PutObjectCommandInput = {
        Bucket: bucketName,
        Key: name,
        Body: fileContents,
        Metadata: metadata,
        ContentType: contentType
    }

    return await s3Client.send(new PutObjectCommand(params));
}

export const handler = async (
    event: APIGatewayProxyEventBase<APIGatewayEventRequestContextJWTAuthorizer>,
): Promise<APIGatewayProxyResultV2> => {
    const eKyc_table = process.env.DYNAMODB_TABLE;
    const s3_bucket = process.env.S3_BUCKET;
    const ekyc_queue_url = process.env.EKYC_QUEUE_URL;

    if (!eKyc_table) {
        throw new Error('No DynamoDB Table found');
    }

    if (!s3_bucket) {
        throw new Error('No S3 Bucket found');
    }

    if (!ekyc_queue_url) {
        throw new Error('No SQS Queue found');
    }

    console.log('event', JSON.stringify(event, null, 2));

    const userId = event.requestContext.authorizer.jwt.claims.sub as string;
    const requestId = uuid();

    console.log(`Request Details: UserId -> ${userId} RequestId -> ${requestId}`);
    console.log(`DynamoDB Table: ${eKyc_table}`);
    console.log(`S3 Bucket: ${s3_bucket}`);

    const s3IdKey = `${userId}/${requestId}/id.jpg`;
    const s3SelfieKey = `${userId}/${requestId}/selfie.jpg`;

    console.log(`S3 Id Key: ${s3IdKey}`);
    console.log(`S3 Selfie Key: ${s3SelfieKey}`);

    try {
        if (!event.body) {
            console.error('Invalid or missing body');
            return {
                body: JSON.stringify({message: 'No body found'}),
                statusCode: constants.HTTP_STATUS_BAD_REQUEST,
                headers: {
                    'Content-Type': 'application/json',
                }
            };
        }

        console.log('Parsing Request Body');
        const body: CreateRequest = JSON.parse(event.body);

        // Validate body
        if (!body.name || !body.date_of_birth || !body.id_number || !body.id_type || !body.id_front || !body.selfie) {
            console.error('Invalid or missing body values');
            return {
                body: JSON.stringify({message: 'Invalid body'}),
                statusCode: constants.HTTP_STATUS_BAD_REQUEST,
                headers: {
                    'Content-Type': 'application/json',
                }
            };
        }

        // Save files to disk
        console.log('Saving files to disk');

        await saveFileToDisk(s3IdKey, body.id_front);
        await saveFileToDisk(s3SelfieKey, body.selfie);

        // Upload files to S3
        console.log('Uploading files to S3');

        await uploadToS3({
            bucketName: s3_bucket,
            name: s3IdKey,
            contentType: 'image/jpeg',
            metadata: {
                userId: userId,
                requestId
            }
        });

        await uploadToS3({
            bucketName: s3_bucket,
            name: s3SelfieKey,
            contentType: 'image/jpeg',
            metadata: {
                userId: userId,
                requestId
            }
        });

        // Push details to DynamoDB
        console.log('Pushing item to DynamoDB');

        const item: Record<string, AttributeValue> = {
            p_key: {S: userId as string},
            s_key: {S: requestId},
            status: {S: 'CREATED'},
            creation_time: {N: Date.now().toString()},
            update_time: {N: Date.now().toString()},
            name: {S: body.name},
            date_of_birth: {S: body.date_of_birth},
            id_number: {S: body.id_number},
            s3_bucket: {S: s3_bucket},
            id_type: {S: body.id_type},
            id_front: {S: s3IdKey},
            selfie: {S: s3SelfieKey},
            complete: {BOOL: false},
        }

        await insertItem(eKyc_table, item);

        // Send message to SQS
        console.log('Publishing item to Queue');

        const message: ValidationRequest = {
            user_id: userId,
            request_id: requestId,
        }

        await sqsClient.send(new SendMessageCommand({
            QueueUrl: ekyc_queue_url,
            MessageBody: JSON.stringify(message)
        }));

        console.log('Returning success to client');

        return {
            body: JSON.stringify({message: 'SUCCESS', userId, requestId}),
            statusCode: constants.HTTP_STATUS_ACCEPTED,
            headers: {
                'Content-Type': 'application/json',
            }
        };
    } catch (error) {
        console.log('Failed to create request: ', error);

        return {
            body: JSON.stringify({message: 'Failed to create request', error}),
            statusCode: constants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            headers: {
                'Content-Type': 'application/json',
            }
        };
    } finally {
        console.log('Cleaning up files');
        // Clean up files
        try {
            await deleteFileFromDisk(s3IdKey);
        } catch (error) {
            console.error('Failed to delete Id file', error);
        }

        try {
            await deleteFileFromDisk(s3SelfieKey);
        } catch (error) {
            console.error('Failed to delete Selfie file', error);
        }

        console.log('Exiting...');
    }
}