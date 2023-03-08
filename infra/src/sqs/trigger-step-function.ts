import {SQSEvent} from 'aws-lambda';
import {SFNClient, StartExecutionCommand} from "@aws-sdk/client-sfn";

// Define an interface for the event
interface EKycRequest {
    request_id: string;
}

/**
 * Trigger Step function from lambda
 * @param event
 */

// Function to trigger Step function
export const triggerStepFunction = async (event: SQSEvent) => {
    const stepFunctionArn = process.env.EKYC_STEP_FUNCTION_ARN;

    //Read the message from the SQS queue
    const message = event.Records[0].body;

    const request: EKycRequest = JSON.parse(message);

    //Trigger Step function using Step function ARN
    const sfnClient = new SFNClient({});
    const response = await sfnClient.send(new StartExecutionCommand({
        stateMachineArn: stepFunctionArn,
        name: request.request_id,
        input: JSON.stringify(request)
    }));

    console.log('Trigger Step Function Response: ', response);
};
