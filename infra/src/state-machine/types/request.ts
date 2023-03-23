export interface EKycRequest {
    user_id: string;
    request_id: string;
    status: string;
    name: string;
    date_of_birth: string;
    id_number: string;
    id_type: string;
    address: string;
    creation_time: number;
    update_time: number;
    id_front: string;
    id_back: string;
    selfie: string;
}