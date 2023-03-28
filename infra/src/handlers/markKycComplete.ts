import {EKycRequest} from "../state-machine/types/request";
import {getItem, updateItem} from "../actions/requests/store";

export const markKycComplete = async ({
                                          request,
                                          success,
                                          error
                                      }: { request: EKycRequest, success: boolean, error: string }) => {
    const dynamoDbTable = process.env.DYNAMODB_TABLE || '';

    try {
        // Update item in DynamoDB
        await updateItem(dynamoDbTable, request.user_id, request.request_id, {
            update_time: {Value: {N: Date.now().toString()}},
            success: {
                Value: {BOOL: success},
            },
            complete: {
                Value: {BOOL: true},
            },
            error: {
                Value: {S: error}
            },
        });

        const item = await getItem(dynamoDbTable, request.user_id, request.request_id);

        item.Item = {
            ...item.Item,
            success: {BOOL: success},
            complete: {BOOL: true}
        };

        return item;
    } catch (err) {
        console.error('Failed to mark workflow as complete', err);
        throw err;
    }
}