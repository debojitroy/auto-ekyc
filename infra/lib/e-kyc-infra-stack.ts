import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as apiGwV2 from "@aws-cdk/aws-apigatewayv2-alpha";
import {WebSocketStage} from "@aws-cdk/aws-apigatewayv2-alpha";
import {WebSocketLambdaIntegration} from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {BillingMode} from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EKycInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const eKycJobsTable = new dynamodb.Table(this, 'eKyc-jobs-table', {
      partitionKey: {name: id, type: dynamodb.AttributeType.STRING},
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const eKycImageBucket = new s3.Bucket(this, 'eKyc-image-bucket', {});

    const eKycDLQ = new sqs.Queue(this, 'eKyc-work-dlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const eKycQueue = new sqs.Queue(this, 'eKyc-work-queue', {
      retentionPeriod: cdk.Duration.days(3),
      deadLetterQueue: {
        queue: eKycDLQ,
        maxReceiveCount: 5,
      }
    });

    const connectHandler = new NodejsFunction(this, 'eKyc-connect-handler', {
      entry: 'src/api/lambda/connect.ts',
      handler: 'handler',
    });

    const webSocketApi = new apiGwV2.WebSocketApi(this, 'eKyc-api-ws', {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('eKyc-api-connect-handler', connectHandler),
        returnResponse: true
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('eKyc-api-default-handler', connectHandler),
        returnResponse: true
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('eKyc-api-disconnect-handler', connectHandler),
        returnResponse: true
      },
    });

    const apiStage = new WebSocketStage(this, 'eKyc-api-stage-dev', {
      webSocketApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    eKycJobsTable.grantReadWriteData(connectHandler);
    eKycImageBucket.grantReadWrite(connectHandler);
    eKycQueue.grantSendMessages(connectHandler);
  }
}
