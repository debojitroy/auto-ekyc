import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as apiGwV2 from "@aws-cdk/aws-apigatewayv2-alpha";
import {WebSocketStage} from "@aws-cdk/aws-apigatewayv2-alpha";
import {WebSocketLambdaIntegration} from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {BillingMode} from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as stepFunction from 'aws-cdk-lib/aws-stepfunctions';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

export class EKycInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const partitionKey = 'partition_key';

        const eKycJobsTable = new dynamodb.Table(this, 'eKyc-jobs-table', {
            partitionKey: {name: 'connection_id', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'tracking_id', type: dynamodb.AttributeType.STRING},
            billingMode: BillingMode.PAY_PER_REQUEST,
        });

        const eKycImageBucket = new s3.Bucket(this, 'eKyc-image-bucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const eKycDLQ = new sqs.Queue(this, 'eKyc-work-dlq', {
            retentionPeriod: cdk.Duration.days(14),
        });

        const eKycQueue = new sqs.Queue(this, 'eKyc-work-queue', {
            retentionPeriod: cdk.Duration.days(3),
            deadLetterQueue: {
                queue: eKycDLQ,
                maxReceiveCount: 5,
            },
        });

        const connectHandler = new NodejsFunction(this, 'eKyc-connect-handler', {
            entry: 'src/api/lambda/connect.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
        });

        const disconnectHandler = new NodejsFunction(this, 'eKyc-disconnect-handler', {
            entry: 'src/api/lambda/disconnect.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
        });

        const notFoundHandler = new NodejsFunction(this, 'eKyc-not-found-handler', {
            entry: 'src/api/lambda/not-found.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
        });

        const eKycCreateHandler = new NodejsFunction(this, 'eKyc-create-route-handler', {
            entry: 'src/api/lambda/ekyc/create-request.ts',
            handler: 'eKycCreateHandler',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            }
        });

        const eKycUploadHandler = new NodejsFunction(this, 'eKyc-upload-route-handler', {
            entry: 'src/api/lambda/ekyc/upload-image.ts',
            handler: 'eKycUploadImageHandler',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
                'S3_BUCKET': eKycImageBucket.bucketName,
            }
        });

        const webSocketApi = new apiGwV2.WebSocketApi(this, 'eKyc-api-ws', {
            connectRouteOptions: {
                integration: new WebSocketLambdaIntegration('eKyc-api-connect-handler', connectHandler),
                returnResponse: true
            },
            defaultRouteOptions: {
                integration: new WebSocketLambdaIntegration('eKyc-api-default-handler', notFoundHandler),
                returnResponse: true
            },
            disconnectRouteOptions: {
                integration: new WebSocketLambdaIntegration('eKyc-api-disconnect-handler', disconnectHandler),
                returnResponse: true
            },
            routeSelectionExpression: '$request.body.action',
        });

        webSocketApi.addRoute(
            'ekyc/create',
            {
                integration: new WebSocketLambdaIntegration('eKyc-api-eKyc-create-handler', eKycCreateHandler),
                returnResponse: true,
            }
        );

        webSocketApi.addRoute(
            'ekyc/upload',
            {
                integration: new WebSocketLambdaIntegration('eKyc-api-eKyc-upload-handler', eKycUploadHandler),
                returnResponse: true,
            }
        );

        new WebSocketStage(this, 'eKyc-api-stage-dev', {
            webSocketApi,
            stageName: 'dev',
            autoDeploy: true,
        });

        const eKycStateMachine = new stepFunction.StateMachine(this, 'eKyc-state-machine', {
            definition: new stepFunction.Succeed(this, 'eKyc-state-machine-succeed', {
                comment: 'eKyc state machine succeed',
                outputPath: '$.Payload',
            }),
            timeout: cdk.Duration.seconds(300),
            stateMachineType: stepFunction.StateMachineType.EXPRESS,
        });

        const eKycQueueHandler = new NodejsFunction(this, 'eKyc-queue-handler', {
            entry: 'src/sqs/trigger-step-function.ts',
            handler: 'triggerStepFunction',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'EKYC_STEP_FUNCTION_ARN': eKycStateMachine.stateMachineArn,
            }
        });

        eKycJobsTable.grantReadWriteData(eKycCreateHandler);
        eKycJobsTable.grantReadWriteData(eKycUploadHandler);

        eKycImageBucket.grantReadWrite(eKycUploadHandler);

        eKycStateMachine.grantStartExecution(eKycQueueHandler);
        eKycQueue.grantConsumeMessages(eKycQueueHandler);

        const eKycLambdaSource = new lambdaEventSources.SqsEventSource(eKycQueue, {
            batchSize: 1,
        });

        eKycQueueHandler.addEventSource(eKycLambdaSource);

        new cdk.CfnOutput(this, 'eKyc-api-url', {
            value: webSocketApi.apiEndpoint,
            description: 'eKyc API WebSocket URL',
            exportName: 'eKyc:WebSocketUrl',
        });

        new cdk.CfnOutput(this, 'eKyc-table-name', {
            value: eKycJobsTable.tableName,
            description: 'eKyc Jobs DynamoDB Table Name',
            exportName: 'eKyc:DynamoDBTableName',
        });

        new cdk.CfnOutput(this, 'eKyc-queue-name', {
            value: eKycQueue.queueName,
            description: 'eKyc Work Queue Name',
            exportName: 'eKyc:QueueName',
        });

        new cdk.CfnOutput(this, 'eKyc-queue-dlq-name', {
            value: eKycDLQ.queueName,
            description: 'eKyc Work Queue DLQ Name',
            exportName: 'eKyc:QueueDLQName',
        });

        new cdk.CfnOutput(this, 'eKyc-bucket-name', {
            value: eKycImageBucket.bucketName,
            description: 'eKyc Image Bucket Name',
            exportName: 'eKyc:BucketName',
        });

        new cdk.CfnOutput(this, 'eKyc-state-machine-arn', {
            value: eKycStateMachine.stateMachineArn,
            description: 'eKyc State Machine ARN',
            exportName: 'eKyc:StateMachineArn',
        });

        new cdk.CfnOutput(this, 'eKyc-queue-handler-name', {
            value: eKycQueueHandler.functionName,
            description: 'eKyc Queue Handler Name',
            exportName: 'eKyc:QueueHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-create-route-handler-name', {
            value: eKycCreateHandler.functionName,
            description: 'eKyc Create Route Handler Name',
            exportName: 'eKyc:CreateRouteHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-upload-route-handler-name', {
            value: eKycUploadHandler.functionName,
            description: 'eKyc Upload Route Handler Name',
            exportName: 'eKyc:UploadRouteHandlerName',
        });
    }
}
