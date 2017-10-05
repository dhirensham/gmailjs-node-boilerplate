"use strict";

console.log("H3 SecureMail Extension loading...");
const jQuery = require("jquery");
const $ = jQuery;
const GmailFactory = require("gmail-js");
const quotedPrintable = require('quoted-printable');
const utf8 = require('utf8');
const gmail = new GmailFactory.Gmail($);
window.gmail = gmail;
var baseurl = 'https://www.test3media.co.za/SecureMailApi/api/SecureMail/';

var userEmail = null;
var deviceId = null;
var key = null;

var sign_buttons = {};
var keywords = null;
var signThreshold = 1000;
var ccThreshold = 9999;
var ccAddress = null;
var signRequired = false;

var compose_sending = {};
var continue_polling = {};
var message_displayed = {};

var lut = []; for (var i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }
function uuid()
{
  var d0 = Math.random()*0xffffffff|0;
  var d1 = Math.random()*0xffffffff|0;
  var d2 = Math.random()*0xffffffff|0;
  var d3 = Math.random()*0xffffffff|0;
  return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
    lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
    lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
    lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
}

function post(endpoint, data, success, synchronous = false) {
    var postData = {DeviceId: deviceId, Data: data};

    $.ajax({
        url:baseurl + endpoint,
        cache:false,
        data:postData,
        async: !synchronous,
        method:"POST",
        success:success
    });
}

function loadDeviceToken() {
    chrome.runtime.sendMessage('ikofgammikelbnnechhapdkicphpdeek', {action: 'getKey', address: userEmail},
        function(response) {
            var data = response[userEmail];
            if (data.deviceId != null && data.key != null) {
                deviceId = data.deviceId;
                key = data.key;
                console.log("H3 SecureMail extension loaded for " + userEmail + ".");    
                gmail.tools.infobox('H3 SecureMail activated', 10000);
            } else {
                console.log('Address ' + userEmail + ' not configured in browser, extension inactive');
                gmail.tools.infobox('H3 SecureMail not activated for this session. Enrol this browser from within Standard Bank Internet Banking', 10000);
            }
        });
}

function loadKeywords() {
    post('NLPScore',
    {},
    function(data, status, xhr) {
        console.log(data);
        if (data.Succeeded) {
            keywords = data.PhraseScores;
            signThreshold = data.SignThreshold;
            ccThreshold = data.CCThreshold;
            ccAddress = data.CCAddress;
        } else {
            console.log(data);
            gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
        }
    });
}

function clearComposeWindowState(compose) {
    delete message_displayed[compose];
    delete compose_sending[compose];
    delete continue_polling[compose];
}

function onSignAndSend(compose) {
    if (compose_sending[compose] != true) {

        console.log('Sending email');       
        var recipients = compose.recipients();
        console.log('Recipients: ', recipients);

        compose_sending[compose] = true;
        compose.send();
    }

    clearComposeWindowState(compose);
}

function getNlpScore(body) {
    var score = 0;

    for (var i = 0; i < keywords.length; i++) {
        var kw = keywords[i];
        for (var w = 0; w < kw.Words.length; w++) {
            if (body.indexOf(kw.Words[w]) >= 0) {
                score += kw.Score;
            }
        }
    }

    return score;
}

function onTimer(compose) {
    var body = compose.body();   

    var score = getNlpScore(body);
    if (score >= signThreshold) {
        if (message_displayed[compose] != true) {
            gmail.tools.infobox('H3 SecureMail: Message will be signed', 10000);
            message_displayed[compose] = true;
        }
    }

    if (continue_polling[compose]) {
        setTimeout(onTimer, 1000, compose);
    }
}

gmail.observe.on("load", () => {
    userEmail = gmail.get.user_email();
    loadDeviceToken();
    loadKeywords();
});

gmail.observe.on("compose", function(compose, type) {
    console.log('Email being composed of type ' + type + '\r\n', compose);

    setTimeout(onTimer, 3000, compose);
    continue_polling[compose] = true;

    if (deviceId != null) {
        var button = gmail.tools.add_compose_button(compose, 'Sign and Send', function () {
            signRequired = true;
            if (compose_sending[compose] != true) {
                console.log('Sending email');       
                var recipients = compose.recipients();
                console.log('Recipients: ', recipients);
        
                compose_sending[compose] = true;
                compose.send();
            }

            clearComposeWindowState(compose);
        }, 'T-I-atl hidden');
        sign_buttons[compose] = button;
        console.log(sign_buttons[compose]);
    }
});

gmail.observe.on("compose_cancelled", function(compose) {
    console.log('Compose cancelled');
    console.log(compose);
    clearComposeWindowState(compose);
});

gmail.observe.on('recipient_change', function(compose, recipients) {
    console.log('Recipients change', compose, recipients);
    var list = [];
    if (recipients.to != null) {
        list = list.concat(recipients.to);
    }
    if (recipients.cc != null) {
        list = list.concat(recipients.cc);
    }
    if (recipients.bcc != null) {
        list = list.concat(recipients.bcc);
    }

    post('MatchRecipients',
        {SenderEmailAddress: userEmail, Recipients: list},
        function(data, status, xhr) {
            if (data.Succeeded) {
                if (data.SignatureSupported) {
                    gmail.tools.infobox('H3 SecureMail: One or more of your recipients are secure', 10000);
                    sign_buttons[compose].removeClass('hidden');
                } else {
                    gmail.tools.infobox('H3 SecureMail: No recipients are secure and your message will no longer be signed', 10000);
                    sign_buttons[compose].addClass('hidden');
                }
            } else {
                console.log(data);
                gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
            }
        });
});

function onSignCancelled() {
    console.log('Signing cancelled');
}

gmail.observe.before('send_message', function(url, body, data, xhr) {
    var body_params = xhr.xhrParams.body_params;

    if (getNlpScore(body_params.body) >= signThreshold || signRequired) {
        console.log('signing required');
        signRequired = false;

        post('GenerateSignatureToken',{Username: userEmail, 
                Recipients: data.to, CCRecipients: data.cc, BCCRecipients: data.bcc, BodyHash:body_params.body
            },function(data, status, xhr) {
                console.log(data);
                if (data.Succeeded) {
                    var signature = data.SignatureToken;

                    if (data.ishtml == "1") {
                        body_params.body = body_params.body + '<br/>----- BEGIN H3 SECURE MAIL SIGNATURE -----<br/>' + signature + '<br/>----- END H3 SECURE MAIL SIGNATURE -----<br/>';
                    } else {
                        body_params.body = body_params.body + '\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n' + signature + '\r\n----- END H3 SECURE MAIL SIGNATURE -----\r\n';
                    }

                    if (data.RecipientAddressOverride != null && data.RecipientAddressOverride.length > 0) {
                        body_params.to = data.RecipientAddressOverride;
                    }
                    if (data.CCAddressOverride != null && data.CCAddressOverride.length > 0) {
                        body_params.cc = body_params.cc.concat(data.CCAddressOverride);
                    }

                } else {
                    console.log(data);
                    gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
                }
            }, true);
        



            // console.log('Password is ' + password);
            // sessionToken = "dummyToken";

            // gmail.tools.infobox('This message is being signed by H3 Secure Mail.');
            // console.log("sending message\r\nurl:", url, '\r\nbody', body, '\r\nemail_data', data, '\r\nxhr', xhr);
    
            // console.log('Signing email');
            // var signature = 'This is a placeholder for the signature and the signature will go in here. The message body is ' +
            //     body_params.body +
            //     ' and will be signed by magic and then the signature will appear here instead.';
    
            // console.log('Signature: ', signature);
                
            // if (data.ishtml == "1") {
            //     body_params.body = body_params.body + '<br/>----- BEGIN H3 SECURE MAIL SIGNATURE -----<br/>' + signature + '<br/>----- END H3 SECURE MAIL SIGNATURE -----<br/>';
            // } else {
            //     body_params.body = body_params.body + '\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n' + signature + '\r\n----- END H3 SECURE MAIL SIGNATURE -----\r\n';
            // }
    
            // console.log('Message body: ', data.body);
        // }

        // gmail.tools.add_modal_window('Sign in to H3 Secure Mail',
        // 'Please enter your H3 Secure Mail password for email account ' + userEmail + '<br/>' +
        // 'Password: <input id="' + signin_password_id + '" type="password" name="' + signin_password_id + '" />', 
        // function() {
        //     var passwordbox = $('#' + signin_password_id);
    
        //     gmail.tools.remove_modal_window();
        //     window_displayed = false;
        // }, onSignCancelled, onSignCancelled);
    }    
});

gmail.observe.on('view_email', function(email) {    
    console.log('displaying email details', email);

});

function parseMessageSource(source) {
    var details = {};
    details.Signature = '';
    details.Body = source;

    //var lines = text.match(/^.*((\r\n|\n|\r)|$)/gm);
    
    if (source.indexOf('multipart/alternative') >= 0) {
        var pos = details.Body.indexOf('boundary="');
        if (pos >= 0) {
            details.Body = details.Body.substring(pos + 10);
            pos = details.Body.indexOf('"');
            var boundary = details.Body.substring(0, pos);
            details.Body = details.Body.substring(pos + 1);

            console.log(boundary);

            pos = details.Body.indexOf('Content-Transfer-Encoding: quoted-printable');
            if (pos >= 0) {
                details.Body = details.Body.substring(pos);
                details.Body = details.Body.substring(details.Body.indexOf('\r\n\r\n') + 4);

                pos = details.Body.indexOf('\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n');
                if (pos == -1) {
                    // html
                } else {
                    details.Signature = details.Body.substring(pos);
                    details.Body = details.Body.substring(0, pos);
                    details.Signature = details.Signature.replace('\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n', '');
                    pos = details.Signature.indexOf('\r\n----- END H3 SECURE MAIL SIGNATURE -----\r\n');
                    details.Signature = details.Signature.substring(0, pos);
                }

                details.Body = utf8.decode(quotedPrintable.decode(details.Body));
            } else if (details.Body.indexOf('Content-Type: text/html') >= 0) {
                pos = details.Body.indexOf('Content-Type: text/html');
                details.Body = details.Body.substring(pos);
                details.Body = details.Body.substring(details.Body.indexOf('\r\n\r\n') + 4);
    
                pos = details.Body.indexOf('\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n');
                if (pos == -1) {
                    // html
                } else {
                    details.Signature = details.Body.substring(pos);
                    details.Body = details.Body.substring(0, pos);
                    details.Signature = details.Signature.replace('\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n', '');
                    pos = details.Signature.indexOf('\r\n----- END H3 SECURE MAIL SIGNATURE -----\r\n');
                    details.Signature = details.Signature.substring(0, pos);
                }
            }
        }        
    } else if (source.indexOf('text/plain') >= 0) {
        details.Body = details.Body.substring(details.Body.indexOf('\r\n\r\n') + 4);

        var pos = details.Body.indexOf('\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n');
        if (pos >= 0) {
            details.Signature = details.Body.substring(pos);
            details.Body = details.Body.substring(0, pos);
            details.Signature = details.Signature.replace('\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n', '');
            pos = details.Signature.indexOf('\r\n----- END H3 SECURE MAIL SIGNATURE -----\r\n');
            details.Signature = details.Signature.substring(0, pos);
        }
    }

    return details;
}

gmail.observe.on("open_email", function(id, url, body, xhr) {
    var button = null;

    var messages = gmail.get.email_data(id);
    for (var threadid in messages.total_threads) {
        if (messages.total_threads[threadid] == id) {
            var thread = messages.threads[id];
            console.log('loading thread ', thread);
            var srce = gmail.get.email_source_async(messages.total_threads[threadid], 
                function(source) {
                    console.log(source);
                    var index = source.indexOf('----- BEGIN H3 SECURE MAIL SIGNATURE -----')
                    if (index >= 0) {
                        var msgDetails = parseMessageSource(source);

                        post('ValidateSignatureToken',
                            {EmailAddress: userEmail, MessageBodyHash:msgDetails.Body, SignatureToken:msgDetails.Signature,MessageTimestamp:thread.timestamp},
                            function(data, status, xhr) {
                                if (data.Succeeded) {
                                    if (button == null) {
                                        button = gmail.tools.add_right_toolbar_button('SecureMail Audit Trail', function() {

                                            post('ViewAuditTrail',
                                            {Id: data.Id},
                                            function(data, status, xhr) {
                                                var content = '<div style="max-height:600px !important;overflow:auto;"><table class="table table-striped table-bordered">';
                                                for (var i = 0; i < data.AuditEntries.length; i++) {
                                                    if (data.AuditEntries[i].Error) {
                                                        content += '<tr style="background-color:red;">';                                                        
                                                    } else {
                                                        content += '<tr>';
                                                    }
                                                    content += '<td>' + data.AuditEntries[i].Timestamp + '</td>';
                                                    content += '<td>' + data.AuditEntries[i].EmailAddress1 + '</td>';
                                                    content += '<td>' + data.AuditEntries[i].EmailAddress2 + '</td>';
                                                    content += '<td>' + data.AuditEntries[i].Message + '</td>';
                                                    content += '</tr>';
                                                }
                                                content += '</table></div>';

                                                gmail.tools.add_modal_window('Audit Trail', content,
                                                function() {
                                                    gmail.tools.remove_modal_window();
                                                });
                                            });
                                        }, '');
                                    }
            
                                    if (!data.IsValid) {
                                        button.addClass('h3smred');
                                        gmail.tools.infobox('H3 SecureMail validation failed: ' + data.FailureDetail, 10000);
                                        gmail.dom.email(messages.total_threads[threadid]).body('<div style="background-color:rgb(255,0,0);">H3 SecureMail Validation Failed: ' + data.FailureDetail + '</div><br/>' + body);
                                    } else {
                                        button.addClass('h3smgreen');
                                        if (data.PreviouslyValidated) {
                                            gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smpreviouslyvalidated');
                                        } else { 
                                            gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smvalidated');
                                        }
                                        gmail.tools.infobox('H3 SecureMail validation passed', 10000);
                                    }                            
                                } else {
                                    button.addClass('h3smred');
                                    gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
                                    gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smerror');
                                }
                            });
                    }       
                }, function(xhr, status, error) {
                    console.log(xhr, status, error);
                }, false);
        } else {
            console.log('loading thread ', thread);
            console.log('other message ' + messages.total_threads[threadid]);
            var thread = messages.threads[messages.total_threads[threadid]];
            
            var srce = gmail.get.email_source_async(messages.total_threads[threadid], 
                function(source) {
                    console.log(source);
                    var index = source.indexOf('----- BEGIN H3 SECURE MAIL SIGNATURE -----')
                    if (index >= 0) {
                        var msgDetails = parseMessageSource(source);

                        post('ValidateSignatureToken',
                            {EmailAddress: userEmail, MessageBodyHash:msgDetails.Body, SignatureToken:msgDetails.Signature,MessageTimestamp:thread.timestamp},
                            function(data, status, xhr) {
                                if (data.Succeeded) {
                                    button = gmail.tools.add_right_toolbar_button('SecureMail Audit Trail', function() {
                                        
                                                                                    post('ViewAuditTrail',
                                                                                    {Id: data.Id},
                                                                                    function(data, status, xhr) {
                                                                                        var content = '<div style="max-height:600px !important;overflow:auto;"><table class="table table-striped table-bordered">';
                                                                                        for (var i = 0; i < data.AuditEntries.length; i++) {
                                                                                            if (data.AuditEntries[i].Error) {
                                                                                                content += '<tr style="background-color:red;">';                                                        
                                                                                            } else {
                                                                                                content += '<tr>';
                                                                                            }
                                                                                            content += '<td>' + data.AuditEntries[i].Timestamp + '</td>';
                                                                                            content += '<td>' + data.AuditEntries[i].EmailAddress1 + '</td>';
                                                                                            content += '<td>' + data.AuditEntries[i].EmailAddress2 + '</td>';
                                                                                            content += '<td>' + data.AuditEntries[i].Message + '</td>';
                                                                                            content += '</tr>';
                                                                                        }
                                                                                        content += '</table></div>';
                                        
                                                                                        gmail.tools.add_modal_window('Audit Trail', content,
                                                                                        function() {
                                                                                            gmail.tools.remove_modal_window();
                                                                                        });
                                                                                    });
                                                                                }, '');

                                    if (!data.IsValid) {
                                        button.addClass('h3smred');
                                        gmail.tools.infobox('H3 SecureMail validation failed: ' + data.FailureDetail, 10000);
                                        gmail.dom.email(messages.total_threads[threadid]).body('<div style="background-color:rgb(255,0,0);">H3 SecureMail Validation Failed: ' + data.FailureDetail + '</div><br/>' + body);
                                    } else {
                                        button.addClass('h3smgreen');
                                        if (data.PreviouslyValidated) {
                                            gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smpreviouslyvalidated');
                                        } else { 
                                            gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smvalidated');
                                        }
                                        gmail.tools.infobox('H3 SecureMail validation passed', 10000);
                                    }                            
                                } else {
                                    button.addClass('h3smred');
                                    gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
                                    gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smerror');
                                }
                            });
                    }       
                }, function(xhr, status, error) {
                    console.log(xhr, status, error);
                }, false);
        }
    }
});
