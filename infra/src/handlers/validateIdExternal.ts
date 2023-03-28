import {EKycRequest} from "../state-machine/types/request";

export interface IdDetails {
    name: string;
    date_of_birth: string;
    id_number: string;
}

export interface ExternalValidationResponse {
    request: EKycRequest;
    details: IdDetails;
    validDocument: boolean;
    message?: string;
    rawResponse?: any;
}

export const validateExternalId = async (request: EKycRequest, details: IdDetails): Promise<ExternalValidationResponse> => {
    const externalValidationResponse = {
        request,
        details,
        validDocument: false,
        message: 'Not implemented',
    }

    // Do a simple compare
    if (details.id_number.trim().replaceAll(' ', '').toUpperCase() !== request.id_number.trim().replaceAll(' ', '').toUpperCase()) {
        externalValidationResponse.message = 'Invalid Document Number';
    } else if (details.date_of_birth.trim().replaceAll(' ', '') !== request.date_of_birth.trim().replaceAll(' ', '')) {
        externalValidationResponse.message = 'Invalid Date of Birth';
    } else if (details.name.trim().replaceAll(' ', '').toUpperCase() !== request.name.trim().replaceAll(' ', '').toUpperCase()) {
        externalValidationResponse.message = 'Invalid Name';
    } else {
        externalValidationResponse.validDocument = true;
        externalValidationResponse.message = '';
    }

    return externalValidationResponse;
}
