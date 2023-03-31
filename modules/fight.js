MODULES["fight"] = {};
MODULES["fight"].breedTimerCutoff1 = 2;
MODULES["fight"].breedTimerCutoff2 = 0.5;
MODULES["fight"].enableDebug = true;

function callBetterAutoFight() {
	if (getPageSetting('autoFight') === 0) return;
	else if (getPageSetting('autoFight') === 1) betterAutoFight();
	else if (getPageSetting('autoFight') === 2) betterAutoFight3();
}

function betterAutoFight() {
	if (game.global.autoBattle && !game.global.pauseFight)
		pauseFight();
	if (game.global.gridArray.length === 0 || game.global.preMapsActive || !game.upgrades.Battle.done || MODULES.maps.livingActive) return;
	var breeding = (game.resources.trimps.owned - game.resources.trimps.employed);
	var newSquadRdy = game.resources.trimps.realMax() <= game.resources.trimps.owned + 1;

	var lowLevelFight = game.resources.trimps.maxSoldiers < breeding * 0.5 && breeding > game.resources.trimps.realMax() * 0.3 && game.global.world < 4;
	if (lowLevelFight) {
		var scientistsAvailable = game.upgrades.Scientists.allowed && !game.upgrades.Scientists.done;
		var minersAvailable = game.upgrades.Miners.allowed && !game.upgrades.Miners.done;
		if (scientistsAvailable || minersAvailable) lowLevelFight = false;
	}
	if (!game.global.fighting) {
		if (newSquadRdy || game.global.soldierHealth > 0 || lowLevelFight || challengeActive('Watch')) {
			fightManual();
		}
	}
}

function betterAutoFight3() {
	if (game.global.autoBattle && game.global.pauseFight && !game.global.spireActive)
		pauseFight();
	if (game.global.gridArray.length === 0 || game.global.preMapsActive || !game.upgrades.Battle.done || game.global.fighting || game.global.spireActive || MODULES.maps.livingActive)
		return;
	if (game.global.world == 1 && !game.global.fighting) {
		fightManual();
	}
}
