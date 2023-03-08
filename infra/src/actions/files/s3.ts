import {S3, PutObjectCommandInput} from '@aws-sdk/client-s3';

// upload file to s3 bucket
export const uploadFile = async (bucketName: string,
                                 file: Buffer,
                                 fileName: string,
                                 contentType: string,
                                 metaData: Record<string, string>) => {
    const s3 = new S3({});

    const params: PutObjectCommandInput = {
        Bucket: bucketName,
        Key: fileName,
        Body: file,
        ContentType: contentType,
        Metadata: metaData,
    };

    return await s3.putObject(params);
}