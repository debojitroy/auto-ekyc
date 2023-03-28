import {EKycRequest} from '../types/request';
import {markKycComplete} from "../../handlers/markKycComplete";

export const markSuccess = async ({
                                      request,
                                  }: { request: EKycRequest, message: string }) => markKycComplete({
    request,
    success: true,
    error: ''
});
