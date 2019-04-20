

var https = require('https');
var querystring = require('querystring');

function getClientId() {
    return process.env['MESSAGING_CLIENT_ID'];
}

function getClientSecret() {
    return process.env['MESSAGING_CLIENT_SECRET'];
}

function getAccountLinkTableName() {
    return process.env['ACCOUNT_LINK_TABLE'];
}

function log(message, message1, message2) {
    console.log(message + message1 + message2);
}

function getUserIdAndEmailFromAccessToken(accessToken) {
    return new Promise((resolve, reject) => {
        var jsonString, jsonObject, options = {
            host: 'api.amazon.com',
            path: '/user/profile?access_token=' + encodeURIComponent(accessToken),
            method: 'get',
            headers: {
                accept: '*/*'
            }
        };

        https.get(options, function(res) {
            res.on('data', function(data) {
                jsonString = data.toString('utf8', 0, data.length);
                log("DEBUG:", "Get profile response: ", jsonString);
                jsonObject = JSON.parse(jsonString);

                if (jsonObject.email && jsonObject.user_id) {
                    log("DEBUG:", "Get email: ", jsonObject.email);
                    log("DEBUG:", "Get user_id: ", jsonObject.user_id);
                    resolve(jsonObject);
                } else {
                    reject(jsonString);
                }
            });
        }).on('error', function(e) {
            log("ERROR:", "Failed to get profile: ", JSON.stringify(e));
            reject(e);
        });
    });
}

function getAccessAndRefreshTokens(grantCode) {
    return new Promise((resolve, reject) => {
        const options = {
            host: 'api.amazon.com',
            path: '/auth/o2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            }
        };

        var body = querystring.stringify({
            grant_type: 'authorization_code',
            code: grantCode,
            client_id: getClientId(),
            client_secret: getClientSecret()
        });

        log("DEBUG:", 'RequestOptions: ' + JSON.stringify(options) + '. Body: ' + JSON.stringify(body), "");
        var req = https.request(options, function(res) {
            res.on('data', function(data) {
                const jsonString = data.toString('utf8', 0, data.length);
                log("DEBUG:", "LWA response: ", jsonString);
                const jsonObject = JSON.parse(jsonString);
                if (jsonObject.access_token && jsonObject.refresh_token) {
                    resolve(jsonObject);
                } else {
                    log("ERROR:", "LWA error: ", jsonString);
                    reject(jsonObject.error_description);
                }
            });
        });
        req.on('error', function(e) {
            log("ERROR:", "Failed to get refresh_token by authorization_code", JSON.stringify(e));
            reject(e);
        });
        req.write(body);
        req.end();
    });
}

function saveAccountLink(userId, email, bearerToken, grantCode, refreshToken, accessToken) {
    return new Promise((resolve, reject) => {
        resolve(email);
    });
}

function getAndSaveAccountLink(bearerToken, grantCode) {
    return getUserIdAndEmailFromAccessToken(bearerToken).then(profile => {
        const email = profile.email;
        const userId = profile.user_id;
        return getAccessAndRefreshTokens(grantCode).then(authTokens => {
            const refreshToken = authTokens.refresh_token;
            const accessToken = authTokens.access_token;
            return saveAccountLink(userId, email, bearerToken, grantCode, refreshToken, accessToken);
        });
    });
}

function handleAcceptGrant(request, context) {
    const requestHeader = request.directive.header;
    const ACCEPT_GRANT_FAILED = {
        event: {
            header: {
                messageId: requestHeader.messageId,
                namespace: "Alexa.Authorization",
                name: "ErrorResponse",
                payloadVersion: "3"
            },
            payload: {
                type: "ACCEPT_GRANT_FAILED",
                message: "Failed to handle the AcceptGrant directive because ..."
            }
        }
    };
    try {
        log("DEBUG:", "getAndSaveAccountLink", "");
        getAndSaveAccountLink(request.directive.payload.grantee.token, request.directive.payload.grant.code).then(email => {
            log("DEBUG:", "Successfully make account link for: ", email);
            const acceptGrantResponse = {
                event: {
                    header: {
                        messageId: requestHeader.messageId,
                        namespace: requestHeader.namespace,
                        name: "AcceptGrant.Response",
                        payloadVersion: requestHeader.payloadVersion
                    },
                    payload: {}
                }
            };
            context.succeed(acceptGrantResponse);
        }).catch(error => {
            log("ERROR:", "Failed to make account link1: ", JSON.stringify(error));
            context.fail(ACCEPT_GRANT_FAILED);
        });
    } catch (error) {
        log("DEBUG:", "Failed to make account link2: ", JSON.stringify(error));
        context.fail(ACCEPT_GRANT_FAILED);
    }
}

exports.handler = function(request, context) {
    if (request.directive.header.namespace === 'Alexa.Authorization' && request.directive.header.name === 'AcceptGrant') {
        log("DEBUG:", "AcceptGrant request", JSON.stringify(request));
        handleAcceptGrant(request, context);
    }
};
