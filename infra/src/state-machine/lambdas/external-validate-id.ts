import {EKycRequest} from '../types/request';
import {updateItem} from "../../actions/requests/store";
import {validateExternalId, IdDetails, ExternalValidationResponse} from '../../handlers/validateIdExternal';

export const externalValidateId = async ({
                                             request,
                                             details
                                         }: { request: EKycRequest, details: IdDetails }): Promise<ExternalValidationResponse> => {
    const dynamoDbTable = process.env.DYNAMODB_TABLE || '';

    let externalValidationResponse: ExternalValidationResponse = {
        request,
        details,
        validDocument: false,
        message: 'Internal server Error',
    }

    try {
        externalValidationResponse = await validateExternalId(request, details);
    } catch (error) {
        console.log('Failed to validate externally', error);
    } finally {
        try {
            // Update item in DynamoDB
            const updateResult = await updateItem(dynamoDbTable, request.user_id, request.request_id, {
                update_time: {Value: {N: Date.now().toString()}},
                status: {Value: {S: externalValidationResponse.validDocument ? 'ID_EXT_VALIDATION_SUCCESSFUL' : 'ID_EXT_VALIDATION_FAILED'}},
                error: {Value: {S: externalValidationResponse.message || ''}},
            });
            console.log('Updated record: ', updateResult);
        } catch (error) {
            console.error('Failed to update record: ', error);
        }
    }

    return externalValidationResponse;
}

