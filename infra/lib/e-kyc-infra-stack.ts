import * as cdk from 'aws-cdk-lib';
import {RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {BillingMode} from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as stepFunction from 'aws-cdk-lib/aws-stepfunctions';
import {LogLevel} from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as apiGateway from '@aws-cdk/aws-apigatewayv2-alpha';
import {CorsHttpMethod} from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apiGatewayAuthorizers from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import * as apiGatewayIntegrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as cognito from 'aws-cdk-lib/aws-cognito';

import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

export class EKycInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const eKycJobsTable = new dynamodb.Table(this, 'eKyc-jobs-table', {
            partitionKey: {name: 'p_key', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 's_key', type: dynamodb.AttributeType.STRING},
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
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
            visibilityTimeout: cdk.Duration.seconds(120),
        });

        // Create Cognito User Pool
        const ekycUserPool = new cognito.UserPool(this, 'ekyc-cognito-user-pool', {
            userPoolName: `ekyc-cognito-user-pool`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true,
            signInAliases: {email: true},
            autoVerify: {email: true},
            passwordPolicy: {
                minLength: 6,
                requireLowercase: false,
                requireDigits: false,
                requireUppercase: false,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        });

        // Create Cognito User Pool Client
        const ekycUserPoolClient = new cognito.UserPoolClient(this, 'ekyc-cognito-user-pool-client', {
            userPool: ekycUserPool,
            authFlows: {
                adminUserPassword: true,
                userPassword: true,
                custom: true,
                userSrp: true,
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
            ],
        });

        // API route handler
        const eKycApiCreateRequestHandler = new NodejsFunction(this, 'eKyc-api-create-request-handler', {
            entry: 'src/api/lambdas/ekyc/create.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
                'S3_BUCKET': eKycImageBucket.bucketName,
                'EKYC_QUEUE_URL': eKycQueue.queueUrl,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(60),
        });

        const eKycApiGetRequestStatusHandler = new NodejsFunction(this, 'eKyc-api-get-request-status-handler', {
            entry: 'src/api/lambdas/ekyc/status-check.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(60),
        });

        // Create the API
        const ekycHttpApi = new apiGateway.HttpApi(this, 'eKyc-api', {
            corsPreflight: {
                allowOrigins: ['https://*', 'http://localhost:3000'],
                allowHeaders: ['Authorization', '*'],
                allowMethods: [CorsHttpMethod.ANY],
                allowCredentials: true,
                maxAge: cdk.Duration.days(365),
            }
        });

        // Create the Authorizer
        const ekycApiAuthorizer = new apiGatewayAuthorizers.HttpUserPoolAuthorizer(
            'ekyc-user-pool-authorizer',
            ekycUserPool,
            {
                userPoolClients: [ekycUserPoolClient],
                identitySource: ['$request.header.Authorization'],
            },
        );

        // Set the Authorizer on the Route
        ekycHttpApi.addRoutes({
            methods: [apiGateway.HttpMethod.POST],
            integration: new apiGatewayIntegrations.HttpLambdaIntegration(
                'ekyc-api-create-request-route',
                eKycApiCreateRequestHandler,
            ),
            path: '/ekyc',
            authorizer: ekycApiAuthorizer
        });

        ekycHttpApi.addRoutes({
            methods: [apiGateway.HttpMethod.GET],
            integration: new apiGatewayIntegrations.HttpLambdaIntegration(
                'ekyc-api-get-request-status-route',
                eKycApiGetRequestStatusHandler,
            ),
            path: '/ekyc',
            authorizer: ekycApiAuthorizer
        });

        const eKycSfnValidateRequestHandler = new NodejsFunction(this, 'eKyc-sfn-validate-request-handler', {
            entry: 'src/state-machine/lambdas/validate.ts',
            handler: 'validateHandler',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(60),
        });

        const eKycSfnFacialMatchHandler = new NodejsFunction(this, 'eKyc-sfn-facial-match-handler', {
            entry: 'src/state-machine/lambdas/facial-match.ts',
            handler: 'facialMatch',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(90),
        });

        const eKycSfnTextExtractionHandler = new NodejsFunction(this, 'eKyc-sfn-text-extraction-handler', {
            entry: 'src/state-machine/lambdas/extract-text.ts',
            handler: 'extractText',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(90),
        });

        const eKycSfnExternalIdValidationHandler = new NodejsFunction(this, 'eKyc-sfn-ext-validation-handler', {
            entry: 'src/state-machine/lambdas/external-validate-id.ts',
            handler: 'externalValidateId',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(90),
        });

        const eKycSfnMarkSuccessHandler = new NodejsFunction(this, 'eKyc-sfn-mark-success-handler', {
            entry: 'src/state-machine/lambdas/mark-success.ts',
            handler: 'markSuccess',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(90),
        });

        const eKycSfnMarkFailedHandler = new NodejsFunction(this, 'eKyc-sfn-mark-failed-handler', {
            entry: 'src/state-machine/lambdas/mark-failed.ts',
            handler: 'markFailed',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'DYNAMODB_TABLE': eKycJobsTable.tableName,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(90),
        });

        const sfnSuccess = new stepFunction.Succeed(this, 'eKyc-state-machine-succeed', {
            comment: 'eKyc state machine succeed',
            outputPath: '$',
        });

        const sfnFailure = new stepFunction.Fail(this, 'eKyc-state-machine-fail', {
            comment: 'eKyc state machine failed',
            error: '$.message',
        });

        const sfnSuccessTask = new tasks.LambdaInvoke(this, 'sfn-success-task', {
            lambdaFunction: eKycSfnMarkSuccessHandler,
            inputPath: '$.Payload',
            outputPath: '$',
        }).next(sfnSuccess);

        const sfnFailureTask = new tasks.LambdaInvoke(this, 'sfn-failure-task', {
            lambdaFunction: eKycSfnMarkFailedHandler,
            inputPath: '$.Payload',
            outputPath: '$',
        }).next(sfnFailure);

        const sfnExternalIdValidationTask = new tasks.LambdaInvoke(this, 'sfn-external-id-validation-request', {
            lambdaFunction: eKycSfnExternalIdValidationHandler,
            inputPath: '$.Payload',
            outputPath: '$',
        });

        const sfnExternalValidationDefinition = sfnExternalIdValidationTask.next(new stepFunction.Choice(this, 'Document Valid?')
            .when(stepFunction.Condition.booleanEquals('$.Payload.validDocument', true), sfnSuccessTask)
            .otherwise(sfnFailureTask));

        const sfnTextExtractionTask = new tasks.LambdaInvoke(this, 'sfn-text-extraction-request', {
            lambdaFunction: eKycSfnTextExtractionHandler,
            inputPath: '$.Payload.request',
            outputPath: '$',
        });

        const sfnTextExtractionDefinition = sfnTextExtractionTask.next(new stepFunction.Choice(this, 'Details Extractable?')
            .when(stepFunction.Condition.booleanEquals('$.Payload.success', true), sfnExternalValidationDefinition)
            .otherwise(sfnFailureTask));

        const sfnFacialMatchTask = new tasks.LambdaInvoke(this, 'sfn-facial-match-request', {
            lambdaFunction: eKycSfnFacialMatchHandler,
            inputPath: '$.Payload.request',
            outputPath: '$',
        });

        const sfnFacialMatchDefinition = sfnFacialMatchTask.next(new stepFunction.Choice(this, 'Face Matches?')
            .when(stepFunction.Condition.booleanEquals('$.Payload.match', true), sfnTextExtractionDefinition)
            .otherwise(sfnFailureTask));

        const sfnValidationTask = new tasks.LambdaInvoke(this, 'sfn-validate-request', {
            lambdaFunction: eKycSfnValidateRequestHandler,
            outputPath: '$',
        });

        const sfnValidationDefinition = sfnValidationTask.next(new stepFunction.Choice(this, 'Is Valid?')
            .when(stepFunction.Condition.booleanEquals('$.Payload.valid', true), sfnFacialMatchDefinition)
            .otherwise(sfnFailureTask));

        const eKycStateMachine = new stepFunction.StateMachine(this, 'eKyc-state-machine', {
            definition: sfnValidationDefinition,
            timeout: cdk.Duration.seconds(300),
            stateMachineType: stepFunction.StateMachineType.EXPRESS,
            logs: {
                level: LogLevel.ALL,
                includeExecutionData: true,
                destination: new logs.LogGroup(this, 'eKyc-state-machine-logs', {
                    retention: RetentionDays.FIVE_DAYS,
                    removalPolicy: RemovalPolicy.DESTROY,
                })
            }
        });

        const eKycSqsTriggerStepFunctionHandler = new NodejsFunction(this, 'eKyc-sqs-trigger-step-function-handler', {
            entry: 'src/sqs/lambdas/trigger-step-function.ts',
            handler: 'triggerStepFunction',
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                'EKYC_STEP_FUNCTION_ARN': eKycStateMachine.stateMachineArn,
            },
            logRetention: RetentionDays.THREE_DAYS,
            timeout: cdk.Duration.seconds(60),
        });

        // Allow lambdas to access DynamoDB
        eKycJobsTable.grantReadWriteData(eKycApiCreateRequestHandler);
        eKycJobsTable.grantReadData(eKycApiGetRequestStatusHandler);
        eKycJobsTable.grantReadData(eKycSfnValidateRequestHandler);
        eKycJobsTable.grantReadWriteData(eKycSfnFacialMatchHandler);
        eKycJobsTable.grantReadWriteData(eKycSfnTextExtractionHandler);
        eKycJobsTable.grantReadWriteData(eKycSfnExternalIdValidationHandler);
        eKycJobsTable.grantReadWriteData(eKycSfnMarkSuccessHandler);
        eKycJobsTable.grantReadWriteData(eKycSfnMarkFailedHandler);

        // Allow lambdas to access S3
        eKycImageBucket.grantReadWrite(eKycApiCreateRequestHandler);
        eKycImageBucket.grantRead(eKycSfnFacialMatchHandler);
        eKycImageBucket.grantRead(eKycSfnTextExtractionHandler);

        // Allow Lambda to invoke Rekognition
        const allowFacialMatchInvocation = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["rekognition:*",],
            resources: ["*"]
        });

        eKycSfnFacialMatchHandler.addToRolePolicy(allowFacialMatchInvocation);

        // Allow Lambda to invoke Textract
        const allowTextractInvocation = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["textract:*",],
            resources: ["*"]
        });

        eKycSfnTextExtractionHandler.addToRolePolicy(allowTextractInvocation);

        // Create Service role for Rekognition
        const allowS3BucketRead = new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    resources: [`${eKycImageBucket.bucketArn}/*`],
                    actions: ['s3:*'],
                }),
            ],
        });

        // Rekognition Service Role
        const rekognitionRole = new iam.Role(this, 'rekognition-service-role', {
            assumedBy: new iam.ServicePrincipal('rekognition.amazonaws.com'),
            description: 'Allow Rekognition to access S3 bucket',
            inlinePolicies: {
                AllowS3BucketRead: allowS3BucketRead,
            },
        });

        // Textract Service Role
        const textractRole = new iam.Role(this, 'textract-service-role', {
            assumedBy: new iam.ServicePrincipal('textract.amazonaws.com'),
            description: 'Allow Textract to access S3 bucket',
            inlinePolicies: {
                AllowS3BucketRead: allowS3BucketRead,
            },
        });

        // Allow Lambda to invoke Step Function
        eKycStateMachine.grantStartExecution(eKycSqsTriggerStepFunctionHandler);

        // Allow Lambda to push messages to SQS
        eKycQueue.grantSendMessages(eKycApiCreateRequestHandler);

        // Allow Lambda to consume messages from SQS
        eKycQueue.grantConsumeMessages(eKycSqsTriggerStepFunctionHandler);

        // Define Lambda Event Source for SQS
        const eKycLambdaSource = new lambdaEventSources.SqsEventSource(eKycQueue, {
            maxConcurrency: 100,
            batchSize: 10,
        });

        eKycSqsTriggerStepFunctionHandler.addEventSource(eKycLambdaSource);

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

        new cdk.CfnOutput(this, 'eKyc-sfn-validate-request-handler-name', {
            value: eKycSfnValidateRequestHandler.functionName,
            description: 'eKyc State Machine Validate Request Handler Name',
            exportName: 'eKyc:sfn:validateRequestHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-sfn-facial-match-handler-name', {
            value: eKycSfnFacialMatchHandler.functionName,
            description: 'eKyc State Machine Facial Match Handler Name',
            exportName: 'eKyc:sfn:facialMatchHandlerHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-sfn-text-extraction-handler-name', {
            value: eKycSfnTextExtractionHandler.functionName,
            description: 'eKyc State Machine Text Extraction Handler Name',
            exportName: 'eKyc:sfn:textExtractionHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-rekognition-service-role-arn', {
            value: rekognitionRole.roleArn,
            description: 'eKyc Rekognition Service Role ARN',
            exportName: 'eKyc:roles:rekognitionRole',
        });

        new cdk.CfnOutput(this, 'eKyc-textract-service-role-arn', {
            value: textractRole.roleArn,
            description: 'eKyc Textract Service Role ARN',
            exportName: 'eKyc:roles:textractRole',
        });

        new cdk.CfnOutput(this, 'eKyc-queue-handler-name', {
            value: eKycSqsTriggerStepFunctionHandler.functionName,
            description: 'eKyc Queue Handler Name',
            exportName: 'eKyc:QueueHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-cognito-user-pool-id', {
            value: ekycUserPool.userPoolId,
            description: 'eKyc Cognito User Pool ID',
            exportName: 'eKyc:UserPoolId',
        });

        new cdk.CfnOutput(this, 'eKyc-cognito-user-pool-client-id', {
            value: ekycUserPoolClient.userPoolClientId,
            description: 'eKyc Cognito User Pool Client ID',
            exportName: 'eKyc:UserPoolClientId',
        });

        new cdk.CfnOutput(this, 'eKyc-api-url', {
            value: ekycHttpApi.url || ekycHttpApi.apiEndpoint,
            description: 'eKyc Http API Url',
            exportName: 'eKyc:ApiUrl',
        });

        new cdk.CfnOutput(this, 'eKyc-api-create-request-handler-name', {
            value: eKycApiCreateRequestHandler.functionName,
            description: 'eKyc API Create Request Handler Name',
            exportName: 'eKyc:api:createRequestHandlerName',
        });

        new cdk.CfnOutput(this, 'eKyc-api-get-request-status-handler-name', {
            value: eKycApiGetRequestStatusHandler.functionName,
            description: 'eKyc API Get Request Status Handler Name',
            exportName: 'eKyc:api:getRequestStatusHandlerName',
        });
    }
}
