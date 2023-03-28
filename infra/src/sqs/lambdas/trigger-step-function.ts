import {SQSEvent} from 'aws-lambda';
import {SFNClient, StartExecutionCommand} from "@aws-sdk/client-sfn";
import {ValidationRequest} from "../../state-machine/types/triggerInput";

/**
 * Trigger Step function from lambdas
 * @param event
 */

// Function to trigger Step function
export const triggerStepFunction = async (event: SQSEvent) => {
    const stepFunctionArn = process.env.EKYC_STEP_FUNCTION_ARN;
    const sfnClient = new SFNClient({});

    //Read the messages from the SQS queue
    for (const message of event.Records) {
        const messageBody = message.body;

        const request: ValidationRequest = JSON.parse(messageBody);

        //Trigger Step function using Step function ARN
        const response = await sfnClient.send(new StartExecutionCommand({
            stateMachineArn: stepFunctionArn,
            name: request.request_id,
            input: JSON.stringify(request)
        }));

        console.log('Trigger Step Function Response: ', response);
    }
};
