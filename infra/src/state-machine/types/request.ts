export interface EKycRequest {
    user_id: string;
    request_id: string;
    status: string;
    name: string;
    date_of_birth: string;
    id_number: string;
    s3_bucket: string;
    id_type: string;
    address: string;
    creation_time: number;
    update_time: number;
    id_front: string;
    selfie: string;
}