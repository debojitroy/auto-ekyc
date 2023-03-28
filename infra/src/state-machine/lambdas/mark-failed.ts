import {EKycRequest} from '../types/request';
import {markKycComplete} from "../../handlers/markKycComplete";

export const markFailed = async ({
                                     request,
                                     message
                                 }: { request: EKycRequest, message: string }) => markKycComplete({
    request,
    success: false,
    error: message
});
