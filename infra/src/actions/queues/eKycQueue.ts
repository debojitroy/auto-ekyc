//Function to send message to SQS queue
import {SendMessageCommand, SendMessageCommandInput, SQSClient} from "@aws-sdk/client-sqs";

//send message to sqs queue
export const sendMessage = async (queueUrl: SendMessageCommandInput["QueueUrl"], messageBody: SendMessageCommandInput["MessageBody"]) => {
    const sqsClient: SQSClient = new SQSClient({});

    const sendMessageCommand = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: messageBody
    });
    return await sqsClient.send(sendMessageCommand);
}