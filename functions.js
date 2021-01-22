const firebase = require('firebase-admin');
var config = JSON.parse(process.env.FIREBASE_CONFIG);
const database = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();
const fetch = require('node-fetch');

var idToken = {};
var functions_base_url = 'https://us-central1-iot-project-1509.cloudfunctions.net';

setInterval(function () {
	idToken = {};
}, 1800000);

exports.getIdToken = async function (uid = process.env.DEFAULT_ADMIN_UID) {
	if (idToken[uid])
		return idToken[uid];
	var customToken = await auth.createCustomToken(uid);
	var result = await fetch(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${config.apiKey}`, {
		method: 'POST',
		body: JSON.stringify({
			token: customToken,
			returnSecureToken: true
		}),
		headers: {
			'Content-Type': 'application/json'
		},
	});
	result = await result.json();
	idToken[uid] = result.idToken;
	console.log(result);
	return result.idToken;
};

exports.accountDeleteAccount = async function (uid) {
	var result = await fetch(`${functions_base_url}/accountDeleteAccount`, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				uid: uid
			}
		}),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${await exports.getIdToken()}`
		},
	});
	return (await result.json()).result;
};

exports.accountLockAccount = async function (uid, minutes, reason) {
	var result = await fetch(`${functions_base_url}/accountBlockAccount`, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				uid: uid,
				minutes: minutes,
				reason: reason
			}
		}),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${await exports.getIdToken()}`
		},
	});
	return (await result.json()).result;
};

exports.accountUnlockAccount = async function (uid, minutes, reason) {
	var result = await fetch(`${functions_base_url}/accountUnblockAccount`, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				uid: uid
			}
		}),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${await exports.getIdToken()}`
		},
	});
	return (await result.json()).result;
};

exports.accountApproveAccount = async function (uid) {
	var result = await fetch(`${functions_base_url}/accountApproveAccount`, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				uid: uid
			}
		}),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${await exports.getIdToken()}`
		},
	});
	return (await result.json()).result;
};

exports.accountRejectAccount = async function (uid) {
	var result = await fetch(`${functions_base_url}/accountRejectAccount`, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				uid: uid
			}
		}),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${await exports.getIdToken()}`
		},
	});
	return (await result.json()).result;
};

exports.accountGetAccountReview = async function () {
	var result = await fetch(`${functions_base_url}/accountGetUsersReview`, {
		method: 'POST',
		body: JSON.stringify({
			data: {}
		}),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${await exports.getIdToken()}`
		},
	});
	return (await result.json()).result;
};

exports.getIPData = async function (ip) {
	var result = await fetch(`http://ip-api.com/json/${ip}`);
	return await result.json();
};