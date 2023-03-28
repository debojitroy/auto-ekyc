import {TextractClient, AnalyzeDocumentCommand} from "@aws-sdk/client-textract";
import {EKycRequest} from '../types/request';
import {updateItem} from "../../actions/requests/store";
import {ExtractTextResponse, parseTextResponse} from '../../handlers/extractIdDetails';


export const extractText = async (request: EKycRequest): Promise<ExtractTextResponse> => {
    const dynamoDbTable = process.env.DYNAMODB_TABLE || '';

    const extractResponse: ExtractTextResponse = {
        success: false,
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

        console.log('Extracted text from document');

        return parseTextResponse(response, request.id_type);
    } catch (error) {
        console.log('Failed to extract text from document', error);
        extractResponse.message = 'Failed to extract text from document';
    }

    return extractResponse;
}