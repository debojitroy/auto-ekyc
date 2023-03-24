import {EKycRequest} from '../types/request';
import {getItem} from '../../actions/requests/store';

export interface ValidationRequest {
    user_id: string;
    request_id: string;
}

export interface ValidationResponse {
    valid: boolean;
    message?: string;
    request?: EKycRequest;
}

// Create a lambda function to validate the request
export const validateHandler = async (event: ValidationRequest): Promise<ValidationResponse> => {
    const eKyc_table = process.env.DYNAMODB_TABLE;

    const response: ValidationResponse = {
        valid: false,
        message: 'Not Found',
    }

    if (!eKyc_table) {
        response.message = 'Table name not found';

        console.log(response);
        return response;
    }

    try {
        // Get key from the request
        const user_id: string = event.user_id;
        const request_id: string = event.request_id;

        const request = await getItem(eKyc_table!, user_id, request_id);

        if (!request || !request.Item) {
            response.message = 'Request Object not found';

            console.log(response);
            return response;
        }

        response.request = {
            user_id: request.Item.p_key && request.Item.p_key.S ? request.Item.p_key.S : '',
            request_id: request.Item.s_key && request.Item.s_key.S ? request.Item.s_key.S : '',
            status: request.Item.status && request.Item.status.S ? request.Item.status.S : '',
            name: request.Item.name && request.Item.name.S ? request.Item.name.S : '',
            address: request.Item.address && request.Item.address.S ? request.Item.address.S : '',
            date_of_birth: request.Item.date_of_birth && request.Item.date_of_birth.S ? request.Item.date_of_birth.S : '',
            id_number: request.Item.id_number && request.Item.id_number.S ? request.Item.id_number.S : '',
            s3_bucket: request.Item.s3_bucket && request.Item.s3_bucket.S ? request.Item.s3_bucket.S : '',
            id_type: request.Item.id_type && request.Item.id_type.S ? request.Item.id_type.S : '',
            id_front: request.Item.id_front && request.Item.id_front.S ? request.Item.id_front.S : '',
            id_back: request.Item.id_back && request.Item.id_back.S ? request.Item.id_back.S : '',
            selfie: request.Item.selfie && request.Item.selfie.S ? request.Item.selfie.S : '',
            creation_time: request.Item.creation_time && request.Item.creation_time.N ? parseInt(request.Item.creation_time.N) : 0,
            update_time: request.Item.update_time && request.Item.update_time.N ? parseInt(request.Item.update_time.N) : 0,
        }

        response.message = 'Request is Valid';
        response.valid = true;

        console.log(response);
        return response;
    } catch (error) {
        console.error('Failed to validate request', error);

        response.message = 'Internal Server Error';
        return response;
    }
}