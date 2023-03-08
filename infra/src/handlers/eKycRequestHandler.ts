import {v4 as uuidv4} from 'uuid';
import {insertItem} from "../actions/requests/store";
import {sendMessage} from "../actions/queues/eKycQueue";
import {uploadFile} from "../actions/files/s3";
import {AttributeValue} from "@aws-sdk/client-dynamodb";

export interface InternalSettings {
    dynamoDbTableName: string;
    partitionKeyName: string;
    s3BucketName: string;
    sqsQueueUrl: string;
}

export interface EKycRequest {
    request_id: string;
    name: string;
    date_of_birth: string;
    id_number: string;
    id_type: 'AADHAAR' | 'PAN' | 'PASSPORT' | 'Driving License' | 'Voter ID' | 'VOTER_ID' | 'VOTERID' | 'VOTER_ID';
    id_front: string;
    id_back: string;
    address: string;
    selfie: string;
    liveliness_selfie: string;
    settings: InternalSettings;
}

export interface EKycResponse {
    request_id: string;
    tracking_id: string;
    status: string;
    message: string;
    error?: string;
    isSuccess: boolean;
}

export const eKycRequestHandler = async (eKycRequest: EKycRequest): Promise<EKycResponse> => {

    const {s3BucketName, sqsQueueUrl, dynamoDbTableName, partitionKeyName} = eKycRequest.settings;

    try {
        //Upload files to S3
        // Selfie
        const selfieKey = `${eKycRequest.request_id}/selfie.jpg`;
        const selfieUploadResult = await uploadFile(s3BucketName, Buffer.from(eKycRequest.selfie, 'base64'), selfieKey, 'image/jpeg', {});

        console.log('selfieUploadResult', selfieUploadResult);

        // Liveliness Selfie
        const livelinessSelfieKey = `${eKycRequest.request_id}/liveliness_selfie.jpg`;
        const livelinessSelfieUploadResult = await uploadFile(s3BucketName, Buffer.from(eKycRequest.liveliness_selfie, 'base64'), livelinessSelfieKey, 'image/jpeg', {});

        console.log('livelinessSelfieUploadResult', livelinessSelfieUploadResult);

        // ID Front
        const idFrontKey = `${eKycRequest.request_id}/id_front.jpg`;
        const idFrontUploadResult = await uploadFile(s3BucketName, Buffer.from(eKycRequest.id_front, 'base64'), idFrontKey, 'image/jpeg', {id_type: eKycRequest.id_type});

        console.log('idFrontUploadResult', idFrontUploadResult);

        // ID Back
        const idBackKey = `${eKycRequest.request_id}/id_back.jpg`;
        const idBackUploadResult = await uploadFile(s3BucketName, Buffer.from(eKycRequest.id_back, 'base64'), idBackKey, 'image/jpeg', {id_type: eKycRequest.id_type});

        console.log('idBackUploadResult', idBackUploadResult);

        // Store in DynamoDB
        const tracking_id = uuidv4();
        const item: Record<string, AttributeValue> = {
            [partitionKeyName]: {S: tracking_id},
            request_id: {S: eKycRequest.request_id},
            status: {S: 'CREATED'},
            creation_time: {N: Date.now().toString()},
            update_time: {N: Date.now().toString()},
            name: {S: eKycRequest.name},
            date_of_birth: {S: eKycRequest.date_of_birth},
            id_number: {S: eKycRequest.id_number},
            id_type: {S: eKycRequest.id_type},
            id_front: {S: idFrontKey},
            id_back: {S: idBackKey},
            selfie: {S: selfieKey},
            liveliness_selfie: {S: livelinessSelfieKey},
            address: {S: eKycRequest.address},
        }

        const storeResult = await insertItem(dynamoDbTableName, item);

        console.log('storeResult', storeResult);

        // Send to SQS
        const message = {
            tracking_id,
        }

        const sendMessageResult = await sendMessage(sqsQueueUrl, JSON.stringify(message));

        console.log('sendMessageResult', sendMessageResult);

        return {
            request_id: eKycRequest.request_id,
            tracking_id,
            status: 'CREATED',
            message: 'Request submitted successfully',
            isSuccess: true,
        }
    } catch (e: Error | any) {
        console.error('Failed to submit request', {
            request: eKycRequest,
            error: e,
        });

        return {
            request_id: eKycRequest.request_id,
            tracking_id: '',
            status: 'FAILED',
            message: 'Failed to submit request',
            error: e.message,
            isSuccess: false,
        };
    }
}