import {TextractClient, AnalyzeDocumentCommand} from "@aws-sdk/client-textract";
import {EKycRequest} from '../types/request';
import {updateItem} from "../../actions/requests/store";
import {ExtractTextResponse, parseTextResponse} from '../../handlers/extractIdDetails';


export const extractText = async (request: EKycRequest): Promise<ExtractTextResponse> => {
    const dynamoDbTable = process.env.DYNAMODB_TABLE || '';

    const extractResponse: ExtractTextResponse = {
        success: false,
        request,
        message: 'Something went wrong',
    };

    try {
        const client = new TextractClient({});

        const input = {
            Document: {
                S3Object: {
                    Bucket: request.s3_bucket,
                    Name: request.id_front,
                }
            },
            FeatureTypes: [
                'FORMS',
            ],
        };

        const command = new AnalyzeDocumentCommand(input);

        const response = await client.send(command);

        console.log('Successfully extracted text from document');

        return parseTextResponse(request, response, request.id_type);
    } catch (error) {
        console.error('Failed to extract text from document', error);
        extractResponse.message = 'Internal server error';
    } finally {
        try {
            // Update item in DynamoDB
            const updateResult = await updateItem(dynamoDbTable, request.user_id, request.request_id, {
                update_time: {Value: {N: Date.now().toString()}},
                status: {Value: {S: extractResponse.success ? 'ID_TEXT_EXTRACTED_SUCCESSFULLY' : 'ID_TEXT_EXTRACTION_FAILED'}},
                error: {Value: {S: extractResponse.message || ''}},
            });
            console.log('Updated record: ', updateResult);
        } catch (error) {
            console.error('Failed to update record: ', error);
        }
    }

    return extractResponse;
}