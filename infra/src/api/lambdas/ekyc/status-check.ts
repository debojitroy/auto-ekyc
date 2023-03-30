import { APIGatewayProxyResultV2 } from "aws-lambda";
import {
  APIGatewayEventRequestContextJWTAuthorizer,
  APIGatewayProxyEventBase,
} from "aws-lambda/trigger/api-gateway-proxy";
import { constants } from "http2";
import { getItem } from "../../../actions/requests/store";

export interface EKycRequestStatusDTO {
  user_id: string;
  request_id: string;
  status: string;
  name: string;
  date_of_birth: string;
  id_number: string;
  s3_bucket: string;
  id_type: string;
  creation_time: number;
  update_time: number;
  id_front: string;
  selfie: string;
  complete?: boolean;
  success?: boolean;
  error?: string;
}

export const handler = async (
  event: APIGatewayProxyEventBase<APIGatewayEventRequestContextJWTAuthorizer>
): Promise<APIGatewayProxyResultV2> => {
  const eKyc_table = process.env.DYNAMODB_TABLE;

  if (!eKyc_table) {
    throw new Error("No DynamoDB Table found");
  }

  console.log("event", JSON.stringify(event, null, 2));

  const request_id = event.queryStringParameters
    ? event.queryStringParameters.request_id
    : undefined;

  if (!request_id) {
    console.error("Missing Request Id");
    return {
      body: JSON.stringify({ message: "Request Id is required" }),
      statusCode: constants.HTTP_STATUS_BAD_REQUEST,
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  const userId = event.requestContext.authorizer.jwt.claims.sub as string;

  try {
    const item = await getItem(eKyc_table, userId, request_id);

    if (!item || !item.Item) {
      console.error("Request not found: ", item);
      return {
        body: JSON.stringify({ message: "No Request Found", request_id }),
        statusCode: constants.HTTP_STATUS_NOT_FOUND,
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    const requestDetails: EKycRequestStatusDTO = {
      user_id: item.Item.p_key && item.Item.p_key.S ? item.Item.p_key.S : "",
      request_id: item.Item.s_key && item.Item.s_key.S ? item.Item.s_key.S : "",
      status: item.Item.status && item.Item.status.S ? item.Item.status.S : "",
      name: item.Item.name && item.Item.name.S ? item.Item.name.S : "",
      date_of_birth:
        item.Item.date_of_birth && item.Item.date_of_birth.S
          ? item.Item.date_of_birth.S
          : "",
      id_number:
        item.Item.id_number && item.Item.id_number.S
          ? item.Item.id_number.S
          : "",
      s3_bucket:
        item.Item.s3_bucket && item.Item.s3_bucket.S
          ? item.Item.s3_bucket.S
          : "",
      id_type:
        item.Item.id_type && item.Item.id_type.S ? item.Item.id_type.S : "",
      id_front:
        item.Item.id_front && item.Item.id_front.S ? item.Item.id_front.S : "",
      selfie: item.Item.selfie && item.Item.selfie.S ? item.Item.selfie.S : "",
      creation_time:
        item.Item.creation_time && item.Item.creation_time.N
          ? parseInt(item.Item.creation_time.N)
          : 0,
      update_time:
        item.Item.update_time && item.Item.update_time.N
          ? parseInt(item.Item.update_time.N)
          : 0,
      complete:
        item.Item.complete && item.Item.complete.BOOL
          ? item.Item.complete.BOOL
          : false,
      success:
        item.Item.success && item.Item.success.BOOL
          ? item.Item.success.BOOL
          : false,
      error: item.Item.error && item.Item.error.S ? item.Item.error.S : "",
    };

    return {
      body: JSON.stringify(requestDetails),
      statusCode: constants.HTTP_STATUS_OK,
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (error) {
    console.error("Failed to fetch status", error);
    return {
      body: JSON.stringify({ message: "Internal Server Error" }),
      statusCode: constants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
};
