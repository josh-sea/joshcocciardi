// Cloud Functions for Verdict (codebase "verdict", see the root firebase.json).
// Deploy: firebase deploy --only functions:verdict

const { initializeApp } = require('firebase-admin/app');
initializeApp();

const tmdb = require('./tmdb');
const users = require('./users');
const fanout = require('./fanout');
const account = require('./account');

exports.verdictTmdb = tmdb.verdictTmdb;

exports.verdictClaimUsername = users.verdictClaimUsername;
exports.verdictSearchUsers = users.verdictSearchUsers;
exports.verdictGetProfile = users.verdictGetProfile;
exports.verdictInviteCode = users.verdictInviteCode;
exports.verdictRedeemInvite = users.verdictRedeemInvite;
exports.verdictMutualCount = users.verdictMutualCount;
exports.verdictBlock = users.verdictBlock;
exports.verdictUnblock = users.verdictUnblock;
exports.verdictBlockedList = users.verdictBlockedList;

exports.verdictOnRatingWrite = fanout.verdictOnRatingWrite;
exports.verdictOnListWrite = fanout.verdictOnListWrite;
exports.verdictOnConnectionWrite = fanout.verdictOnConnectionWrite;

exports.verdictDeleteAccount = account.verdictDeleteAccount;
