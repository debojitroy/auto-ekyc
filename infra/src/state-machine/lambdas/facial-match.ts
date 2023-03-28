import {RekognitionClient, CompareFacesCommand} from "@aws-sdk/client-rekognition";
import {EKycRequest} from '../types/request';
import {updateItem} from "../../actions/requests/store";

export interface FacialMatchResponse {
    match: boolean;
    confidence: number;
    request: EKycRequest;
    raw_response?: any;
    message?: string;
}

export const facialMatch = async (request: EKycRequest): Promise<FacialMatchResponse> => {
    const dynamoDbTable = process.env.DYNAMODB_TABLE || '';
    let facialMatchResponse: FacialMatchResponse = {
        match: false,
        confidence: 0,
        request,
    }

    const rekognitionClient = new RekognitionClient({});

    try {
        const compareFacesCommand = new CompareFacesCommand({
            SourceImage: {
                S3Object: {
                    Bucket: request.s3_bucket,
                    Name: request.id_front,
                }
            },
            TargetImage: {
                S3Object: {
                    Bucket: request.s3_bucket,
                    Name: request.selfie,
                }
            },
            SimilarityThreshold: 90.0
        });

        const response = await rekognitionClient.send(compareFacesCommand);

        const hasMatches = !!(response && response.FaceMatches && response.FaceMatches.length > 0 && response.FaceMatches[0].Similarity && response.FaceMatches[0].Similarity >= 90.0);

        facialMatchResponse = {
            match: hasMatches,
            confidence: hasMatches ? response!.FaceMatches![0]!.Similarity! : 0,
            raw_response: response,
            message: !hasMatches ? 'No face matches' : undefined,
            request: {...request, status: 'FACIAL_MATCHED_SUCCESSFULLY'},
        }
    } catch (error) {
        console.error('Failed to match faces: ', error);

        facialMatchResponse = {
            match: false,
            confidence: 0,
            message: 'Internal Server Error',
            request: {...request, status: 'FACIAL_MATCH_FAILED'},
        };
    } finally {
        try {
            // Update item in DynamoDB
            const updateResult = await updateItem(dynamoDbTable, request.user_id, request.request_id, {
                update_time: {Value: {N: Date.now().toString()}},
                status: {Value: {S: facialMatchResponse.match ? 'FACIAL_MATCHED_SUCCESSFULLY' : 'FACIAL_MATCH_FAILED'}},
                error: {Value: {S: facialMatchResponse.message || ''}},
            });
            console.log('Updated record: ', updateResult);
        } catch (error) {
            console.error('Failed to update record: ', error);
        }
    }

    return facialMatchResponse;
}