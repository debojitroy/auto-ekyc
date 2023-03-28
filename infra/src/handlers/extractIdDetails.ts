import {AnalyzeDocumentCommandOutput} from "@aws-sdk/client-textract";
import {EKycRequest} from "../state-machine/types/request";

export interface ExtractTextResponse {
    success: boolean;
    id_type?: string;
    details?: {
        name?: string;
        date_of_birth?: string;
        id_number?: string;
    }
    request: EKycRequest;
    raw_response?: any;
    message?: string;
}

export const parseTextResponse = (request: EKycRequest, response: AnalyzeDocumentCommandOutput, id_type: string): ExtractTextResponse => {
    if (!response || !response.Blocks || response.Blocks.length === 0) {
        return {
            success: false,
            id_type,
            message: 'No response or no blocks found',
            raw_response: response,
            request,
        }
    }

    switch (id_type.toUpperCase()) {
        case 'AADHAAR':
            const aadhaarDetails = extractAadhaarDetails(request, response);
            return {
                ...aadhaarDetails,
                id_type,
                raw_response: response,
            };
        case 'PAN':
            const panDetails = extractPanDetails(request, response);
            return {
                ...panDetails,
                id_type,
                raw_response: response,
            }
        default:
            return {
                success: false,
                id_type,
                message: 'Unsupported ID type',
                raw_response: response,
                request,
            };
    }
}

const extractAadhaarDetails = (request: EKycRequest, response: AnalyzeDocumentCommandOutput): ExtractTextResponse => {
    // Filter the details
    const filteredLines = response.Blocks!.filter(block => (block.BlockType === 'LINE' && block.Confidence && block.Confidence > 75));

    if (filteredLines.length === 0) {
        return {
            success: false,
            message: 'No Lines found with high confidence',
            request,
        }
    }

    // Extract the details
    // Name between 25 and 29
    const nameData = filteredLines.filter(block => (block.Geometry
        && block.Geometry.BoundingBox
        && block.Geometry.BoundingBox.Top
        && block.Geometry?.BoundingBox?.Top >= 0.25
        && block.Geometry?.BoundingBox?.Top <= 0.29));

    if (nameData.length === 0 || !nameData[0].Text || nameData[0].Text.trim().length === 0) {
        return {
            success: false,
            message: 'No Name found',
            request,
        }
    }

    const name = nameData[0].Text;

    // Date of Birth between 30 and 34
    const dateOfBirthData = filteredLines.filter(block => (block.Geometry
        && block.Geometry.BoundingBox
        && block.Geometry.BoundingBox.Top
        && block.Geometry?.BoundingBox?.Top >= 0.30
        && block.Geometry?.BoundingBox?.Top <= 0.34));

    if (dateOfBirthData.length === 0
        || !dateOfBirthData[0].Text
        || dateOfBirthData[0].Text.trim().length === 0
        || dateOfBirthData[0].Text.trim().split(' ').length !== 2) {
        return {
            success: false,
            message: 'No Date of Birth found',
            request,
        }
    }

    const dateOfBirth = dateOfBirthData[0].Text.trim().split(' ')[1];

    // Aadhaar Number between 75 and 82
    const aadhaarNumberData = filteredLines.filter(block => (block.Geometry
        && block.Geometry.BoundingBox
        && block.Geometry.BoundingBox.Top
        && block.Geometry?.BoundingBox?.Top >= 0.75
        && block.Geometry?.BoundingBox?.Top <= 0.82));

    if (aadhaarNumberData.length === 0
        || !aadhaarNumberData[0].Text
        || aadhaarNumberData[0].Text.trim().length === 0) {
        return {
            success: false,
            message: 'No Aadhaar Number found',
            request,
        }
    }

    const aadhaarNumber = aadhaarNumberData[0].Text;

    return {
        success: true,
        details: {
            name,
            date_of_birth: dateOfBirth,
            id_number: aadhaarNumber
        },
        request,
    }
}

const extractPanDetails = (request: EKycRequest, response: AnalyzeDocumentCommandOutput): ExtractTextResponse => {
    // Filter the details
    const filteredLines = response.Blocks!.filter(block => (block.BlockType === 'LINE' && block.Confidence && block.Confidence > 90));

    if (filteredLines.length === 0) {
        return {
            success: false,
            message: 'No Lines found with high confidence',
            request,
        }
    }

    // Extract the details
    // PAN between Top 40 and 50, Left 30 and 40
    const panData = filteredLines.filter(block => (block.Geometry
        && block.Geometry.BoundingBox
        && block.Geometry.BoundingBox.Top
        && block.Geometry.BoundingBox.Left
        && block.Geometry?.BoundingBox?.Top >= 0.40
        && block.Geometry?.BoundingBox?.Top <= 0.50
        && block.Geometry?.BoundingBox?.Left >= 0.30
        && block.Geometry?.BoundingBox?.Left <= 0.40));

    if (panData.length === 0 || !panData[0].Text || panData[0].Text.trim().length === 0) {
        return {
            success: false,
            message: 'No PAN Number found',
            request,
        }
    }

    const pan = panData[0].Text;

    // Name between Top 55 and 60, Left 2 and 10
    const nameData = filteredLines.filter(block => (block.Geometry
        && block.Geometry.BoundingBox
        && block.Geometry.BoundingBox.Top
        && block.Geometry.BoundingBox.Left
        && block.Geometry?.BoundingBox?.Top >= 0.55
        && block.Geometry?.BoundingBox?.Top <= 0.60
        && block.Geometry?.BoundingBox?.Left >= 0.02
        && block.Geometry?.BoundingBox?.Left <= 0.10));

    if (nameData.length === 0 || !nameData[0].Text || nameData[0].Text.trim().length === 0) {
        return {
            success: false,
            message: 'No Name found',
            request,
        }
    }

    const name = nameData[0].Text;

    // Date of Birth between Top 88 and 90, Left 5 and 10
    const dateOfBirthData = filteredLines.filter(block => (block.Geometry
        && block.Geometry.BoundingBox
        && block.Geometry.BoundingBox.Top
        && block.Geometry.BoundingBox.Left
        && block.Geometry?.BoundingBox?.Top >= 0.88
        && block.Geometry?.BoundingBox?.Top <= 0.90
        && block.Geometry?.BoundingBox?.Left >= 0.05
        && block.Geometry?.BoundingBox?.Left <= 0.10));

    if (dateOfBirthData.length === 0
        || !dateOfBirthData[0].Text
        || dateOfBirthData[0].Text.trim().length === 0) {
        return {
            success: false,
            message: 'No Date of Birth found',
            request,
        }
    }

    const dateOfBirth = dateOfBirthData[0].Text;

    return {
        success: true,
        details: {
            name,
            date_of_birth: dateOfBirth,
            id_number: pan,
        },
        request,
    };
}