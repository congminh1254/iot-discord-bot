exports.Permission = {
	10: 'Administrator',
	5: 'Moderator',
	2: 'Player',
	1: 'WaitingForReview',
	0: 'Banned',
	ADMINISTRATOR: 10,
	MODERATOR: 5,
	PLAYER: 2,
	WAITFORREVIEW: 1,
	BANNED: 0
};

exports.ActionResultCode =
{
	ACTION_SUCCESS: 1,
	ACTION_ERROR: 0
};

exports.pad = function (number, size) {
	var s = String(number);
	while (s.length < (size || 2)) { s = '0' + s; }
	return s;
};

exports.makeid = function (length) {
	var result = '';
	var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
};

exports.check_answer = function (text, answer) {
	var index = null;
	var s = null;
	text = text.trim().toUpperCase();
	for (index in answer) {
		var svAns = answer[index].trim().toUpperCase();
		if (text === svAns)
			return true;
		//----
		var arr1 = text.split(',');
		var arr2 = svAns.replace(/~>/g, '⨝').split('⨝');
		if (arr1.length === arr2.length) {
			var valid = true;
			for (s = 0; s < arr1.length; s++) {
				if (arr1[s].trim() !== arr2[s].trim())
					valid = false;
			}
			if (valid)
				return true;
		}

		arr2 = svAns.replace(/~\+/g, '⨝').split('⨝');
		for (var i = 0; i < arr2.length; i++)
			arr2[i] = arr2[i].trim();
		arr2 = arr2.sort();
		for (i = 0; i < arr1.length; i++)
			arr1[i] = arr1[i].trim();
		arr1 = arr1.sort();
		if (arr1.length === arr2.length) {
			valid = true;
			for (s = 0; s < arr1.length; s++) {
				if (arr1[s].trim() !== arr2[s].trim())
					valid = false;
			}
			if (valid)
				return true;
		}
	}
	return false;
};

exports.shuffle = function (a) {
	var j, x, i;
	for (i = a.length - 1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));
		x = a[i];
		a[i] = a[j];
		a[j] = x;
	}
	return a;
};


exports.calcRank = function (point) {
	var joResult = {
		point: point,
		rank: 1,
		grade: 1
	};
	if (point >= 3500) {
		joResult.rank = 6;
		joResult.grade = 1;
	} else {
		if (point >= 3000) {
			joResult.rank = 5;
			joResult.grade = 5 - Math.floor((point - 3000) / 100);
		} else if (point >= 2500) {
			joResult.rank = 4;
			joResult.grade = 5 - Math.floor((point - 2500) / 100);
		} else if (point >= 2000) {
			joResult.rank = 3;
			joResult.grade = 5 - Math.floor((point - 2000) / 100);
		} else if (point >= 1500) {
			joResult.rank = 2;
			joResult.grade = 5 - Math.floor((point - 1500) / 100);
		} else if (point >= 1000) {
			joResult.rank = 1;
			joResult.grade = 5 - Math.floor((point - 1000) / 100);
		} else {
			joResult.rank = 0;
			joResult.grade = 5 - Math.floor((point) / 200);
		}
	}
	return joResult;
};
function getRankName(rank) {
	switch (rank) {
	case 0:
		return 'Tân Binh';
	case 1:
		return 'Đồng';
	case 2:
		return 'Bạc';
	case 3:
		return 'Vàng';
	case 4:
		return 'Bạch Kim';
	case 5:
		return 'Kim Cương';
	case 6:
		return 'Cao Thủ';
	case 7:
		return 'Thách Đấu';
	}
	return '';
}

function getGrade(grade) {
	switch (grade) {
	case 1:
		return 'I';
	case 2:
		return 'II';
	case 3:
		return 'III';
	case 4:
		return 'IV';
	case 5:
		return 'V';
	}
	return '';
}

exports.getRankGradeName = function(rg) {
	if (rg != null && rg.rank != null && rg.grade != null) {
		if (rg.rank < 6)
			return getRankName(rg.rank) + ' ' + getGrade(rg.grade);
		else
			return getRankName(rg.rank);
	} else
	{
		console.log(`Error -> getRankGradeName -> ${JSON.stringify(rg)}`);
		return '';
	}
};