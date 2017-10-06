"use strict";

console.log("H3 SecureMail Extension loading...");
const jQuery = require("jquery");
const $ = jQuery;
const GmailFactory = require("gmail-js");
const quotedPrintable = require('quoted-printable');
const utf8 = require('utf8');
const gmail = new GmailFactory.Gmail($);
window.gmail = gmail;
var sjcl = require('sjcl');

var baseurl = 'https://www.test3media.co.za/SecureMailApi/api/SecureMail/';
var extensionkey = 'cffllcciaibdnojibffomofbmdnonlcg';

var userEmail = null;
var deviceId = null;
var key = null;

var sign_buttons = {};
var keywords = null;
var autocc = null;
var signThreshold = 1000;
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
    chrome.runtime.sendMessage(extensionkey, {action: 'getKey', address: userEmail},
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
            autocc = data.AutoCCThresholds;
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
        $('.T-I-atl').css('background-image', '-webkit-linear-gradient(top,#4def90,#47de87)');
    } else {
        $('.T-I-atl').css('background-image', '');        
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
    console.log(body_params);
    console.log(body);
    var score = getNlpScore(body_params.body);

    if (score >= signThreshold || signRequired) {
        console.log('signing required');
        signRequired = false;

        for (var i = 0; i < autocc.length; i++) {
            if (score >= autocc[i].Threshold) {
                body_params.cc = body_params.cc.concat(autocc[i].RecipientAddress);
                break;
            }
        }

        var hash = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(body_params.body));
        
        post('GenerateSignatureToken',{Username: userEmail, 
                Recipients: data.to, CCRecipients: data.cc, BCCRecipients: data.bcc, BodyHash:hash
            },function(data, status, xhr) {
                console.log(data);
                if (data.Succeeded) {
                    var signature = data.SignatureToken;

                    if (data.ishtml == "1") {
                        body_params.body = body_params.body + '<br/>----- BEGIN H3 SECURE MAIL SIGNATURE -----<br/>' + signature + '<br/>----- END H3 SECURE MAIL SIGNATURE -----<br/>';
                    } else {
                        body_params.body = body_params.body + '\r\n----- BEGIN H3 SECURE MAIL SIGNATURE -----\r\n' + signature + '\r\n----- END H3 SECURE MAIL SIGNATURE -----\r\n';
                    }
                } else {
                    console.log(data);
                    gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
                }
            }, true);
    }    
});

gmail.observe.on('view_email', function(email) {    
    console.log('displaying email details', email);

});

function htmlDecode(value) {
    return $("<textarea/>").html(value).text();
  }

function parseMessageSource(source) {
    var details = {};
    details.Signature = '';
    details.Body = source;

    if (source.indexOf('multipart/alternative') >= 0) {
        var pos = details.Body.indexOf('boundary="');
        if (pos >= 0) {
            details.Body = details.Body.substring(pos + 10);
            pos = details.Body.indexOf('"');
            var boundary = details.Body.substring(0, pos);
            details.Body = details.Body.substring(pos + 1);

            console.log(boundary);
            var ishtml = false;

            if (details.Body.indexOf('Content-Type: text/html') >= 0) {
                pos = details.Body.indexOf('Content-Type: text/html');
                details.Body = details.Body.substring(pos);
                ishtml = true;
            }

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
                if (ishtml) {
                    details.Body = htmlDecode(details.Body);
                }
                details.Signature = utf8.decode(quotedPrintable.decode(details.Signature));
            } else {
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
            details.Signature = utf8.decode(quotedPrintable.decode(details.Signature));
        } else {
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
    }

    console.log(details.Body);
    details.Body = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(details.Body));

    console.log(details);
    return details;
}

function addAuditTrailButton(id) {
    return gmail.tools.add_right_toolbar_button('SecureMail Audit Trail', function() {        
        post('ViewAuditTrail',
        {Id: id},
        function(data, status, xhr) {
            var array = data.AuditEntries;
            var flags = [], output = [], l = array.length, i;

            for(i=0; i<l; i++) {
                if(flags[array[i].EmailAddress1]) continue;
                flags[array[i].EmailAddress1] = true;
                output.push(array[i].EmailAddress1);
            }

            var content = '<div style="max-height:600px !important;overflow:auto;">';
            
            for (var a = 0; a < output.length; a++) {
                content += '<h2>' + output[a] + '</h2><br/>';
                content += '<table class="table table-striped table-bordered">';
                for (var i = 0; i < data.AuditEntries.length; i++) {
                    if (data.AuditEntries[i].EmailAddress1 != output[a]) {
                        continue;
                    }
                    if (data.AuditEntries[i].Error) {
                        content += '<tr style="background-color:red;">';                                                        
                    } else {
                        content += '<tr>';
                    }
                    var date = new Date(data.AuditEntries[i].Timestamp);
                    content += '<td>' + date.toLocaleString() + '</td>';
                    // content += '<td>' + data.AuditEntries[i].EmailAddress1 + '</td>';
                    // content += '<td>' + data.AuditEntries[i].EmailAddress2 + '</td>';
                    content += '<td>' + data.AuditEntries[i].Message + '</td>';
                    content += '</tr>';
                }
                content += '</table><br/>';
            }
            content += '</div>';

            gmail.tools.add_modal_window('Audit Trail', content,
            function() {
                gmail.tools.remove_modal_window();
            });
            $('#gmailJsModalWindow').addClass('widepopup');
        });
    }, '');
}

var button = null;

function processReceivedEmail(source, messages, threadid, thread) {
    var msgDetails = parseMessageSource(source);
    
    post('ValidateSignatureToken',
        {EmailAddress: userEmail, MessageBodyHash:msgDetails.Body, SignatureToken:msgDetails.Signature,MessageTimestamp:thread.timestamp},
        function(data, status, xhr) {
            if (data.Succeeded) {
                if (button == null) {
                    button = addAuditTrailButton(data.Id);
                }

                if (!data.IsValid) {
                    button.addClass('h3smred');
                    gmail.tools.infobox('H3 SecureMail validation failed: ' + data.FailureDetail, 10000);
                    gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smfail');
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
                if (button != null) {
                    button.addClass('h3smred');
                }
                gmail.tools.infobox('H3 SecureMail error: ' + data.ErrorMessage);
                gmail.dom.email(messages.total_threads[threadid]).dom().addClass('h3smerror');
            }
        });
}

gmail.observe.on("open_email", function(id, url, body, xhr) {
    button = null;

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
                        processReceivedEmail(source, messages, threadid, thread);
                    }       
                }, function(xhr, status, error) {
                    console.log(xhr, status, error);
                }, false);
        } else {
            var thread = messages.threads[id];
            console.log('loading thread ', thread);
            console.log('other message ' + messages.total_threads[threadid]);
            var thread = messages.threads[messages.total_threads[threadid]];
            
            var srce = gmail.get.email_source_async(messages.total_threads[threadid], 
                function(source) {
                    console.log(source);
                    var index = source.indexOf('----- BEGIN H3 SECURE MAIL SIGNATURE -----')
                    if (index >= 0) {
                        processReceivedEmail(source, messages, threadid, thread);
                    }       
                }, function(xhr, status, error) {
                    console.log(xhr, status, error);
                }, false);
        }
    }
});
