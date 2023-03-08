import {
    Context,
    APIGatewayProxyResultV2,
    APIGatewayProxyWebsocketHandlerV2,
    APIGatewayProxyWebsocketEventV2
} from 'aws-lambda';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event: APIGatewayProxyWebsocketEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    return {
        statusCode: 400,
        body: JSON.stringify({
            message: 'Route not found',
            route: event.requestContext.routeKey,
        }),
    };
};