const firebase = require('firebase-admin');
var config = JSON.parse((new Buffer(process.env.FIREBASE_CONFIG, 'base64')).toString('ascii'));
const auth = firebase.auth();
const fetch = require('node-fetch');
const { io } = require('socket.io-client');

var idToken = {};
var socket = null;

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
	return result.idToken;
};

exports.getSocket = function () {
	try {
		if (socket && socket.connected) {
			socket.disconnect();
		}
		if (socket) {
			delete socket;
		}
	}
	catch (e) {
		console.log(e);
	}
	return new Promise((resolve) => {
		exports.getIdToken().then(function (idToken) {
			console.log(process.env.IOT_SOCKET_URL, {
				reconnectionDelay: 1000,
				reconnectionAttempts: Infinity,
				auth: {
					token: idToken
				},
				query: {
					location: '/discord'
				}
			});
			socket = io(process.env.IOT_SOCKET_URL, {
				reconnectionDelay: 1000,
				reconnectionAttempts: Infinity,
				auth: {
					token: idToken
				},
				query: {
					location: '/discord'
				}
			});
			socket.on('connect', function () {
				console.log('Connected to IOT server');
			});
			socket.on('disconnect', function () {
				console.log('Disconnected from IOT server');
			});
			socket.on('error', function (error) {
				console.log('Error from IOT server: ' + error);
			});
			resolve(socket);
		});
	});
};

exports.accountDeleteAccount = async function (uid) {
	await exports.getSocket();
	return new Promise((resolve) => {
		socket.emit('function', 'accountDeleteAccount', {
			uid: uid
		}, function (result) {
			resolve(result);
		});
	});
};

exports.accountLockAccount = async function (uid, minutes, reason) {
	await exports.getSocket();
	return new Promise((resolve) => {
		socket.emit('function', 'accountBlockAccount', {
			uid: uid,
			minutes: minutes,
			reason: reason
		}, function (result) {
			resolve(result);
		});
	});
};

exports.accountUnlockAccount = async function (uid) {
	await exports.getSocket();
	return new Promise((resolve) => {
		socket.emit('function', 'accountUnblockAccount', {
			uid: uid
		}, function (result) {
			resolve(result);
		});
	});
};

exports.accountApproveAccount = async function (uid) {
	await exports.getSocket();
	return new Promise((resolve) => {
		socket.emit('function', 'accountApproveAccount', {
			uid: uid
		}, function (result) {
			resolve(result);
		});
	});
};

exports.accountRejectAccount = async function (uid) {
	await exports.getSocket();
	return new Promise((resolve) => {
		socket.emit('function', 'accountRejectAccount', {
			uid: uid
		}, function (result) {
			resolve(result);
		});
	});
};

exports.accountGetAccountReview = async function () {
	await exports.getSocket();
	return new Promise((resolve) => {
		socket.emit('function', 'accountGetUsersReview', {}, function (result) {
			resolve(result);
		});
	});
};

exports.getIPData = async function (ip) {
	var result = await fetch(`http://ip-api.com/json/${ip}`);
	return await result.json();
};