function safeBuyJob(jobTitle, amount) {
	if (!Number.isFinite(amount) || amount === 0 || game.jobs[jobTitle].locked) {
		return;
	}

	const freeWorkers = Math.ceil(game.resources.trimps.realMax() / 2) - game.resources.trimps.employed;
	const fireState = game.global.firing;
	const currBuyAmt = game.global.buyAmt;

	game.global.firing = amount < 0;
	game.global.buyAmt = Math.abs(amount);

	let result = game.global.firing || canAffordJobCheck(jobTitle, amount);

	if (!result && freeWorkers > 0) {
		game.global.buyAmt = 'Max';
		game.global.maxSplit = 1;
		result = canAffordJobCheck(jobTitle, amount);
	}

	if (result) {
		debug(`${game.global.firing ? 'Firing' : 'Hiring'} ${prettify(amount)} ${jobTitle}${addAnS(amount)}`, 'jobs', '*users');
		buyJob(jobTitle, true, true);
		if (game.global.firing !== fireState) fireMode_AT();
	}

	game.global.buyAmt = currBuyAmt;
}

function canAffordJobCheck(what, amt) {
	const job = game.jobs[what];
	if (job.max <= job.owned) return false;

	if (game.global.buyAmt === 'Max') {
		amt = calculateMaxAfford(job, false, false, true);
	}

	return Object.keys(job.cost).every((costItem) => checkJobItem(what, false, costItem, null, amt) === true);
}

function workerRatios(workerRatio, jobRatios) {
	if (!workerRatio) return;

	const jobSetting = getPageSetting('jobType');

	if (jobSetting === 2) {
		const jobSettings = getPageSetting('jobSettingsArray');
		return jobSettings[workerRatio].enabled ? jobSettings[workerRatio].ratio : 0;
	}

	let ratioSet;
	if (game.global.StaffEquipped.rarity !== undefined && game.global.StaffEquipped.rarity >= 10 && game.global.universe !== 1) {
		ratioSet = jobRatios.ratioHaz;
	} else if (game.global.world >= 300) {
		ratioSet = jobRatios.ratio7;
	} else if (game.buildings.Tribute.owned > 3000 && mutations.Magma.active()) {
		ratioSet = jobRatios.ratio6;
	} else if (game.buildings.Tribute.owned > 1500) {
		ratioSet = jobRatios.ratio5;
	} else if (game.buildings.Tribute.owned > 1000) {
		ratioSet = jobRatios.ratio4;
	} else if (game.resources.trimps.realMax() > 3000000) {
		ratioSet = jobRatios.ratio3;
	} else if (game.resources.trimps.realMax() > 300000) {
		ratioSet = jobRatios.ratio2;
	} else if (challengeActive('Metal') || challengeActive('Transmute')) {
		ratioSet = [4, 5, 0];
	} else if (game.global.world < 5) {
		ratioSet = [1.5, 0.7, 1];
	} else {
		ratioSet = jobRatios.ratio1;
	}

	if (workerRatio.includes('Farmer')) return ratioSet[0];
	else if (workerRatio.includes('Lumber')) return ratioSet[1];
	else if (workerRatio.includes('Miner')) return ratioSet[2];
}

function fireMode_AT() {
	game.global.firing = !game.global.firing;
	const elem = document.getElementById('fireBtn');
	const firingClass = game.global.firing ? 'fireBtnFiring' : 'fireBtnNotFiring';
	const notFiringClass = game.global.firing ? 'fireBtnNotFiring' : 'fireBtnFiring';
	const buttonText = game.global.firing ? 'Firing' : 'Fire';

	elem.className = elem.className.replace(notFiringClass, firingClass);
	elem.innerHTML = buttonText;
}

//Fires all workers to ensure we can do things like respec
function fireAllWorkers() {
	['Farmer', 'Lumberjack', 'Miner', 'Scientist'].forEach((job) => {
		if (game.jobs[job].owned > 0) safeBuyJob(job, -game.jobs[job].owned);
	});
}

function buyJobs(forceRatios) {
	if (game.jobs.Farmer.locked || game.resources.trimps.owned === 0 || getPageSetting('jobType') === 0) return;

	if (!game.global.fighting && challengeActive('Archaeology') && breedTimeRemaining().cmp(0.1) > 0) {
		fireAllWorkers();
		return;
	}

	const jobSettings = getPageSetting('jobSettingsArray');
	const maxTrimps = game.resources.trimps.realMax();
	let { owned, employed, maxSoldiers } = game.resources.trimps;
	if (!game.options.menu.fireForJobs.enabled) game.options.menu.fireForJobs.enabled = 1;

	let freeWorkers = _calculateFreeWorkers(owned, employed);

	//Check breeding trimps and if we can have enough breeding then purchase workers.
	if (!noBreedChallenge() && owned < maxTrimps * 0.9) {
		_handleBreedingTrimps(owned, maxTrimps, employed);
		return;
	}

	freeWorkers = _handleNoBreedChallenges(freeWorkers, owned, employed, maxSoldiers);

	freeWorkers = _buyRatioJobs(freeWorkers, jobSettings);

	const desiredRatios = _getDesiredRatios(forceRatios, jobSettings);

	_handleJobRatios(desiredRatios, freeWorkers);
}

function _calculateFreeWorkers(owned, employed) {
	const maxTrimps = game.resources.trimps.realMax();
	const currentFreeWorkers = Math.ceil(Math.min(maxTrimps / 2), owned) - employed;
	const ratioWorkers = ['Farmer', 'Lumberjack', 'Miner', 'Scientist'];
	const ratioWorkerCount = ratioWorkers.reduce((total, worker) => total + game.jobs[worker].owned, 0);
	return currentFreeWorkers + ratioWorkerCount;
}

function _handleBreedingTrimps(owned, maxTrimps, employed) {
	const breedingTrimps = owned - trimpsEffectivelyEmployed();
	const excessBreedingTrimps = breedingTrimps > maxTrimps * 0.33;
	const freeWorkers = Math.ceil(maxTrimps / 2) - employed;
	const canHireWorkers = freeWorkers > 0 && maxTrimps <= 3e5;

	if (excessBreedingTrimps && canHireWorkers) {
		safeBuyJob('Farmer', 1);
		if (!game.jobs.Lumberjack.locked) safeBuyJob('Lumberjack', 1);
		if (!game.jobs.Miner.locked) safeBuyJob('Miner', 1);
	}
}

function _handleNoBreedChallenges(freeWorkers, owned, employed, maxSoldiers) {
	if (!noBreedChallenge()) return freeWorkers;

	freeWorkers = owned - employed + ratioWorkerCount;
	if ((!game.global.fighting || game.global.soldierHealth <= 0) && freeWorkers > maxSoldiers) freeWorkers -= maxSoldiers;

	if (getPageSetting('trapper')) {
		let coordTarget = getPageSetting('trapperCoords') - 1;
		if (!game.global.runningChallengeSquared && coordTarget <= 0) coordTarget = trimps.currChallenge === 'Trapper' ? 32 : 49;
		const nextCoordCost = Math.ceil(1.25 * maxSoldiers) - maxSoldiers;
		const { done, allowed } = game.upgrades.Coordination;
		const canBuyCoordination = done < coordTarget && done !== allowed;

		if (freeWorkers > nextCoordCost && canBuyCoordination) freeWorkers -= nextCoordCost;
	}

	return freeWorkers;
}

function _buyRatioJobs(freeWorkers, jobSettings) {
	freeWorkers -= _buyExplorer(jobSettings);

	if (game.global.universe === 1) {
		freeWorkers -= _buyTrainer(jobSettings);
		freeWorkers -= _buyMagmamancer(jobSettings);
	}

	if (game.global.universe === 2) {
		freeWorkers -= _buyMeteorologist(jobSettings);
		freeWorkers -= _buyWorshipper(jobSettings);
	}

	return freeWorkers;
}

function _buyExplorer(jobSettings) {
	if (game.jobs.Explorer.locked || !jobSettings.Explorer.enabled || mapSettings.mapName === 'Tribute Farm') return 0;
	const { cost, owned } = game.jobs.Explorer;
	const affordableExplorers = getMaxAffordable(cost.food[0] * Math.pow(cost.food[1], owned), game.resources.food.owned * (jobSettings.Explorer.percent / 100), cost.food[1], true);

	if (affordableExplorers > 0) safeBuyJob('Explorer', affordableExplorers);
	return affordableExplorers;
}

function _buyTrainer(jobSettings) {
	if (game.jobs.Trainer.locked || !jobSettings.Trainer.enabled) return 0;
	const { cost, owned } = game.jobs.Trainer;
	const affordableTrainers = getMaxAffordable(cost.food[0] * Math.pow(cost.food[1], owned), game.resources.food.owned * (jobSettings.Trainer.percent / 100), cost.food[1], true);

	if (affordableTrainers > 0) safeBuyJob('Trainer', affordableTrainers);
	return affordableTrainers;
}

function _buyMagmamancer(jobSettings) {
	if (game.jobs.Magmamancer.locked || !jobSettings.Magmamancer.enabled) return 0;
	let timeOnZone = Math.floor((Date.now() - game.global.zoneStarted) / 60000);
	timeOnZone += game.talents.magmamancer.purchased ? 5 : 0;
	timeOnZone += game.talents.stillMagmamancer.purchased ? game.global.spireRows : 0;

	if (timeOnZone < 10) return 0;

	const { cost, owned } = game.jobs.Magmamancer;
	const affordableMagmamancer = getMaxAffordable(cost.gems[0] * Math.pow(cost.gems[1], owned), game.resources.gems.owned * (jobSettings.Magmamancer.percent / 100), cost.gems[1], true);

	if (affordableMagmamancer > 0) safeBuyJob('Magmamancer', affordableMagmamancer);
	return affordableMagmamancer;
}

function _buyMeteorologist(jobSettings) {
	if (game.jobs.Meteorologist.locked || (!jobSettings.Meteorologist.enabled && !mapSettings.shouldMeteorologist) || runningAncientTreasure()) return 0;
	const { cost, owned } = game.jobs.Meteorologist;
	const costMult = mapSettings.shouldMeteorologist ? 1 : jobSettings.Meteorologist.percent / 100;
	let affordableMets = getMaxAffordable(cost.food[0] * Math.pow(cost.food[1], owned), game.resources.food.owned * costMult, cost.food[1], true);
	if (mapSettings.shouldMeteorologist && mapSettings.ancientTreasure && mapSettings.totalCost > game.resources.food.owned) affordableMets = 0;

	if (affordableMets > 0 && !mapSettings.shouldTribute) safeBuyJob('Meteorologist', affordableMets);
	return mapSettings.shouldTribute ? 0 : affordableMets;
}

function _buyWorshipper(jobSettings) {
	if (game.jobs.Worshipper.locked || !jobSettings.Worshipper.enabled) return 0;
	const { owned, getCost } = game.jobs.Worshipper;
	const costMult = mapSettings.mapName !== 'Worshipper Farm' ? jobSettings.Worshipper.percent / 100 : 1;
	const affordableShips = Math.min(Math.floor((game.resources.food.owned / getCost()) * costMult), 50 - owned);

	if (affordableShips > 0) safeBuyJob('Worshipper', affordableShips);
	return affordableShips;
}

function _getDesiredRatios(forceRatios, jobSettings) {
	const ratioWorkers = ['Farmer', 'Lumberjack', 'Miner', 'Scientist'];
	const scientistRatios = { ratio: 1, ratio2: 3, ratio3: 1, ratio4: 0.1, ratio5: 0.01, ratio6: 0.001, ratio7: 0.0001, ratioHaz: 0.00001 };
	const jobRatios = { ratioHaz: [1, 1, 1], ratio7: [1, 1, 98], ratio6: [1, 7, 12], ratio5: [1, 2, 22], ratio4: [1, 1, 10], ratio3: [3, 1, 4], ratio2: [3, 3, 5], ratio1: [1.1, 1.15, 1.2] };
	let scientistMod;

	if (game.global.world >= 65) scientistMod = scientistRatios.ratio4;
	else if (game.global.world >= 50) scientistMod = scientistRatios.ratio3;
	else if (game.jobs.Farmer.owned < 100) scientistMod = scientistRatios.ratio2;
	else scientistMod = scientistRatios.ratio;

	let desiredRatios = [0, 0, 0, 0];
	let workerRatio;
	let overrideRatio = forceRatios || (getPageSetting('autoMaps') > 0 && mapSettings.jobRatio && mapSettings.jobRatio !== '-1');
	if (overrideRatio) {
		workerRatio = forceRatios || mapSettings.jobRatio;

		desiredRatios = workerRatio.split(',').map((val, index) => {
			const job = game.jobs[ratioWorkers[index]];
			return job.locked || !val ? 0 : Number(val);
		});
	}

	const scienceNeeded = setResourceNeeded().science;
	const isScienceNeeded = scienceNeeded > 0 && scienceNeeded > game.resources.science.owned;
	scientistMod = desiredRatios[3] !== 0 || isScienceNeeded ? 1 : scientistMod;

	ratioWorkers.forEach((worker, workerIndex) => {
		if (!game.jobs[worker].locked) {
			if (worker === 'Scientist') {
				if (desiredRatios[workerIndex] === 0) desiredRatios[workerIndex] = 1;
			} else {
				desiredRatios[workerIndex] = scientistMod * (overrideRatio ? desiredRatios[workerIndex] : parseFloat(workerRatios(worker, jobRatios)));
			}
		} else {
			desiredRatios[workerIndex] = 0;
		}
	});

	if (game.global.universe === 2 && !workerRatio) {
		if (jobSettings.FarmersUntil.enabled && game.global.world >= jobSettings.FarmersUntil.zone) desiredRatios[0] = 0;
		if (jobSettings.NoLumberjacks.enabled && !game.mapUnlocks.SmithFree.canRunOnce) desiredRatios[1] = 0;
	}

	if (challengeActive('Metal') || challengeActive('Transmute')) {
		if (!game.jobs.Lumberjack.locked) desiredRatios[1] += desiredRatios[2];
		else desiredRatios[0] += desiredRatios[2];
		desiredRatios[2] = 0;
	}

	let scientistsAvailable = game.upgrades.Scientists.done;
	if (!scientistsAvailable) desiredRatios[3] = 0;

	return desiredRatios;
}

function _handleJobRatios(desiredRatios, freeWorkers) {
	const ratioWorkers = ['Farmer', 'Lumberjack', 'Miner', 'Scientist'];
	const totalFraction = desiredRatios.reduce((a, b) => a + b, 0) || 1;
	let desiredWorkers = [0, 0, 0, 0];
	let totalWorkerCost = 0;

	for (let i = 0; i < ratioWorkers.length; i++) {
		desiredWorkers[i] = Math.floor((freeWorkers * desiredRatios[i]) / totalFraction - game.jobs[ratioWorkers[i]].owned);
		if (desiredWorkers[i] > 0) totalWorkerCost += game.jobs[ratioWorkers[i]].cost.food * desiredWorkers[i];
	}

	if (totalWorkerCost > game.resources.food.owned) {
		safeBuyJob('Farmer', freeWorkers);
	} else {
		for (let i = 0; i < desiredWorkers.length; i++) {
			if (desiredWorkers[i] > 0) continue;
			if (Math.abs(desiredWorkers[i]) <= 0) continue;
			safeBuyJob(ratioWorkers[i], -Math.abs(desiredWorkers[i]));
		}

		for (let i = 0; i < desiredWorkers.length; i++) {
			if (desiredWorkers[i] <= 0) continue;
			safeBuyJob(ratioWorkers[i], Math.abs(desiredWorkers[i]));
		}
	}
}
