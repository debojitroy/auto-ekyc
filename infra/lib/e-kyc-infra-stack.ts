import * as cdk from 'aws-cdk-lib';
import {Construct, Node} from 'constructs';
import * as apiGwV2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {WebSocketStage} from "@aws-cdk/aws-apigatewayv2-alpha";

export class EKycInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const connectHandler = new NodejsFunction(this, 'eKyc-connect-handler', {
      entry: 'src/lambda/connect.ts',
      handler: 'handler',
    });

    const webSocketApi = new apiGwV2.WebSocketApi(this, 'eKyc-api-ws', {
      connectRouteOptions: { integration: new WebSocketLambdaIntegration('eKyc-api-connect-handler', connectHandler), returnResponse: true},
      defaultRouteOptions: { integration: new WebSocketLambdaIntegration('eKyc-api-default-handler', connectHandler), returnResponse: true },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration('eKyc-api-disconnect-handler', connectHandler), returnResponse: true},
    });

    const apiStage = new WebSocketStage(this, 'eKyc-api-stage-dev', {
      webSocketApi,
      stageName: 'dev',
      autoDeploy: true,
    });
  }
}
