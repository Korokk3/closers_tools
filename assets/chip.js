(function () {
    const CHIP_JSON = './data/chip_data.json';
    const LANG_JSON = './data/chip_lang.json';
    const MAX_SHOW_LEVEL = 25;
    const EQUIP_LABELS = {
        EP_POWER_PRIVATE: '코어',
        EP_POWER_WEAPON: '모듈',
        EP_POWER_DEFENCE: '실드',
        EP_POWER_RECEIVER: '리시버',
        EP_TRANSFORM: '디스크',
    };
    const EQUIP_ORDER = ['코어', '모듈', '실드', '리시버', '디스크'];

    let chips = [];
    let statMeta = {};
    let equipLabels = { ...EQUIP_LABELS };
    let slotLabels = {};
    let buffLabels = {};
    const el = (id) => document.getElementById(id);

    function parseId(val) {
        if (!val) return null;
        const id = parseInt(val, 10);
        return isNaN(id) ? null : id;
    }

    function chipById(id) {
        return chips.find((chip) => chip.chip_id === id);
    }

    function hasEquipSlot(chip, equipType) {
        return !!(chip.equipment_options && chip.equipment_options[equipType]);
    }

    function getMaxLevelForChip(chip, equipType) {
        const levels = Object.keys((chip.equipment_options && chip.equipment_options[equipType]) || {});
        let max = 0;
        levels.forEach((levelKey) => {
            const level = parseInt(levelKey, 10);
            if (!isNaN(level)) max = Math.max(max, level);
        });
        return Math.min(max, MAX_SHOW_LEVEL);
    }

    function getEquipStatsAtLevel(chip, level, equipType) {
        const entry = chip.equipment_options && chip.equipment_options[equipType] && chip.equipment_options[equipType][String(level)];
        return entry && Array.isArray(entry.stat_data) ? entry.stat_data : [];
    }

    function normalizeStats(statsArray) {
        return Object.fromEntries((statsArray || []).map((stat) => [stat[0], stat[1]]));
    }

    function accumulatedExp(chip, level) {
        if (!chip.exp_requirements) return 0;
        const exact = chip.exp_requirements[level];
        if (typeof exact === 'number') return exact;
        const keys = Object.keys(chip.exp_requirements)
            .map((key) => parseInt(key, 10))
            .filter((value) => !isNaN(value))
            .sort((a, b) => a - b);
        let found = 0;
        for (const key of keys) {
            if (key <= level) found = Math.max(found, chip.exp_requirements[key]);
        }
        return found;
    }

    function expToLevel(chip, exp) {
        if (!chip.exp_requirements) return 0;
        const pairs = Object.entries(chip.exp_requirements)
            .map(([key, value]) => [parseInt(key, 10), value])
            .filter((pair) => !isNaN(pair[0]))
            .sort((a, b) => a[0] - b[0]);
        let level = 0;
        for (const [levelKey, total] of pairs) {
            if (total <= exp) level = levelKey;
            else break;
        }
        return level;
    }

    function getProgressInfo(chip, level, carriedExp) {
        if (!chip.exp_requirements) return null;
        const currentKey = String(level);
        const nextKey = String(level + 1);
        if (!(nextKey in chip.exp_requirements)) return null;

        const currentTotal = chip.exp_requirements[currentKey] ?? accumulatedExp(chip, level);
        const nextTotal = chip.exp_requirements[nextKey];
        const totalNeeded = Math.max(0, nextTotal - currentTotal);
        const effectiveExp = carriedExp !== undefined && carriedExp !== null ? carriedExp : currentTotal;
        const progress = Math.max(0, Math.min(effectiveExp - currentTotal, totalNeeded));

        return {
            currentTotal,
            nextTotal,
            totalNeeded,
            progress,
            currentKey,
            nextKey
        };
    }

    function renderProgressMarkup(chip, level, carriedExp) {
        const info = getProgressInfo(chip, level, carriedExp);
        if (!info || level == MAX_SHOW_LEVEL) {
            return '<div class="chip-progress chip-progress-max" style="margin-top: 12px; font-weight: bold; color: #e5a910;">MAX</div>';
        }

        const ratio = info.totalNeeded > 0 ? Math.max(0, Math.min(1, info.progress / info.totalNeeded)) : 1;
        return `
            <div class="chip-progress" style="margin-top: 12px;">
                <div class="chip-progress-track" aria-hidden="true" style="width: 100%; height: 8px; background-color: #e0e0e0; border-radius: 4px; overflow: hidden;">
                    <div class="chip-progress-fill" style="width:${Math.round(ratio * 100)}%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"></div>
                </div>
                <div class="chip-progress-meta" style="margin-top: 4px; font-size: 0.85em; color: #666; text-align: right;">+${formatNumber(level + 1)}까지 ${formatNumber(info.progress)}/${formatNumber(info.totalNeeded)}</div>
            </div>
        `;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return String(value);
        try {
            return Number(value).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            });
        } catch (e) {
            return String(Number(value.toFixed(2)));
        }
    }

    function formatStatValue(statKey, value) {
        if (statKey === 'BUFF') {
            if (Array.isArray(value)) {
                return value.map((token) => buffLabels[token] || token).join(' / ');
            }
            return buffLabels[value] || String(value);
        }
        const meta = statMeta[statKey] || {};
        if (meta.format === 'percent') {
            return `${formatNumber(value * 100)}%`;
        }
        return formatNumber(value);
    }

    function formatStatDiff(statKey, delta) {
        if (isNaN(delta)) return "-";
        if (Math.abs(delta) < 1e-9) delta = 0;
        const meta = statMeta[statKey] || {};
        const sign = delta > 0 ? '+' : '';
        if (meta.format === 'percent') {
            return `${sign}${formatNumber(delta * 100)}%`;
        }
        return `${sign}${formatNumber(delta)}`;
    }

    function getStatLabel(statKey) {
        if (statKey === 'BUFF') return (statMeta.BUFF && statMeta.BUFF.label) || '버프';
        const meta = statMeta[statKey];
        return meta && meta.label ? meta.label : statKey;
    }

    function getSlotLabel(slotKey) {
        return slotLabels[slotKey] || slotKey;
    }

    function getEquipOrderIndex(equipType) {
        const label = equipLabels[equipType] || EQUIP_LABELS[equipType] || equipType;
        const index = EQUIP_ORDER.indexOf(label);
        return index === -1 ? EQUIP_ORDER.length : index;
    }

    function buildChip1Options(equipType) {
        const chip1 = el('chip1-select');
        chip1.innerHTML = '<option value="">-- 칩 선택 --</option>';
        const level1 = el('chip1-level');
        level1.innerHTML = '<option value="0">+0</option>';
        level1.disabled = true;
        if (!equipType) {
            chip1.disabled = true;
            return;
        }
        chip1.disabled = false;

        chips.forEach((chip) => {
            if (!hasEquipSlot(chip, equipType)) return;
            const option = document.createElement('option');
            option.value = String(chip.chip_id);
            option.textContent = chip.name;
            chip1.appendChild(option);
        });
    }

    let chip2LevelWasAutoMapped = false;

    function populateLevelSelect(selectEl, minLevel, maxLevel, defaultLevel, markLevel) {
        const chip1 = el('chip1-select');
        const chip2 = el('chip2-select');

        selectEl.innerHTML = '';
        for (let lvl = minLevel; lvl <= maxLevel; lvl++) {
            const opt = document.createElement('option');
            opt.value = String(lvl);
            if (typeof markLevel === 'number' && lvl === markLevel && (chip1.value !== chip2.value)) opt.textContent = `+${lvl} [계승]`;
            else opt.textContent = `+${lvl}`;
            selectEl.appendChild(opt);
        }
        selectEl.value = String(defaultLevel !== undefined ? defaultLevel : minLevel);
    }

    function buildChip2Options(equipType, chip1Id, chip1Level) {
        const chip2 = el('chip2-select');
        const level2 = el('chip2-level');
        chip2.innerHTML = '<option value="">-- 칩 선택 --</option>';
        level2.innerHTML = '<option value="0">+0</option>';
        level2.disabled = true;

        if (!equipType || !chip1Id) {
            chip2.disabled = true;
            return;
        }
        const chip1 = chipById(chip1Id);
        if (!chip1) {
            chip2.disabled = true;
            return;
        }
        const requiredColorSlot = chip1.slot_key;
        const chip1MaxLevel = getMaxLevelForChip(chip1, equipType);
        const chip1AtMaxLevel = chip1Level >= chip1MaxLevel;
        chip2.disabled = false;

        chips.forEach((candidate) => {
            if (!hasEquipSlot(candidate, equipType)) return;
            if (!candidate.slot_key || candidate.slot_key !== requiredColorSlot) return;
            if (chip1AtMaxLevel && candidate.chip_id === chip1.chip_id) return;
            const opt = document.createElement('option');
            opt.value = String(candidate.chip_id);
            opt.textContent = candidate.name;
            chip2.appendChild(opt);
        });
    }

    function formatAccumulatedExp(chip, level, carriedExp) {
        const accum = accumulatedExp(chip, level);
        const info = getProgressInfo(chip, level, carriedExp);
        if (info && info.progress > 0) {
            return `${formatNumber(accum)} (+${formatNumber(info.progress)})`;
        }
        return formatNumber(accum);
    }

    function renderSingle(chip, level, equipType) {
        const area = el('comparison-area');
        const stats = getEquipStatsAtLevel(chip, level, equipType);
        const parts = [];
        const accum = accumulatedExp(chip, level);
        const accumText = formatAccumulatedExp(chip, level, accum);

        parts.push(`<div class="pet-card"><div class="pet-name">${chip.name} +${formatNumber(level)}</div><div class="pet-detail">${getSlotLabel(chip.slot_key)}</div><div style="margin-top:8px;font-size:0.9em;color:#666">누적 경험치: ${accumText}</div>${renderProgressMarkup(chip, level, accum)}</div>`);

        if (stats.length === 0) {
            parts.push('<div class="empty-state"><p>선택한 칩의 표시 가능한 능력치가 없습니다.</p></div>');
            area.innerHTML = parts.join('\n');
            return;
        }

        parts.push('<div style="margin-top:16px"></div>');
        parts.push('<table>\n<thead><tr><th>능력치</th><th>값</th></tr></thead><tbody>');
        stats.forEach((stat) => {
            parts.push(`<tr><td class="stat-name">${getStatLabel(stat[0])}</td><td>${formatStatValue(stat[0], stat[1])}</td></tr>`);
        });
        parts.push('</tbody></table>');

        area.innerHTML = parts.join('\n');
    }

    function renderComparison(a, aLevel, b, bLevel, inherited, equipType) {
        const area = el('comparison-area');
        const parts = [];
        const aAccum = accumulatedExp(a, aLevel);
        const bAccum = accumulatedExp(b, bLevel);
        const bEffectiveAccum = aAccum;
        const requiredExp = bAccum - aAccum;
        const showRequiredExp = !inherited && requiredExp > 0;
        const need = b.exp_requirements && b.exp_requirements[bLevel]
            ? b.exp_requirements[bLevel] - (b.exp_requirements[bLevel - 1] || 0)
            : null;

        const aAccumText = formatAccumulatedExp(a, aLevel, aAccum);
        const bAccumText = formatAccumulatedExp(b, bLevel, bEffectiveAccum);

        parts.push(
            `<div class="result-hero" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;"><div class="pet-card"><div class="pet-name">1)
            ${a.name} +${formatNumber(aLevel)}</div><div class="pet-detail">${getSlotLabel(a.slot_key)}</div>
            <div style="margin-top:8px;font-size:0.9em;color:#666">
            누적 경험치: ${aAccumText}</div>${renderProgressMarkup(a, aLevel, aAccum)}</div>
            <div class="pet-card pet2"><div class="pet-name">
            2) ${b.name} +${formatNumber(bLevel)}${inherited ? '' : ''}</div>
            <div class="pet-detail">${getSlotLabel(b.slot_key)}</div>
            <div style="margin-top:8px;font-size:0.9em;color:#666">
            ${showRequiredExp ? "필요 오버클럭 경험치: " + formatNumber(requiredExp) + "<br>" : ""}
            누적 경험치: ${bAccumText}</div>${renderProgressMarkup(b, bLevel, bEffectiveAccum)}</div></div>`
        );

        if (a.chip_id !== b.chip_id && inherited) {
            const progressInfo = getProgressInfo(b, bLevel, bEffectiveAccum);
            if ((!progressInfo || bLevel === MAX_SHOW_LEVEL) && aAccum > bAccum) {
                const loss = aAccum - bAccum;
                parts.push(`<div class="warning-box">⚠ 계승 시 경험치 손실이 있습니다. (손실 경험치: ${formatNumber(loss)})</div>`);
            }
        }

        const aStats = normalizeStats(getEquipStatsAtLevel(a, aLevel, equipType));
        const bStats = normalizeStats(getEquipStatsAtLevel(b, bLevel, equipType));
        const statKeys = Array.from(new Set([...Object.keys(aStats), ...Object.keys(bStats)]));

        if (statKeys.length === 0) {
            parts.push('<div class="empty-state"><p>선택한 칩의 비교 데이터가 없습니다.</p></div>');
            area.innerHTML = parts.join('\n');
            return;
        }

        const rows = statKeys.map((statKey) => {
            const hasA = Object.prototype.hasOwnProperty.call(aStats, statKey);
            const hasB = Object.prototype.hasOwnProperty.call(bStats, statKey);
            const av = hasA ? aStats[statKey] : 0;
            const bv = hasB ? bStats[statKey] : 0;
            const delta = Math.abs(bv - av) < 1e-9 ? 0 : (bv - av);
            const diffText = formatStatDiff(statKey, delta);
            const diff = delta > 0
                ? `<span class="diff-positive">${diffText}</span>`
                : delta < 0
                    ? `<span class="diff">${diffText}</span>`
                    : diffText;
            return `<tr><td class="stat-name">${getStatLabel(statKey)}</td><td class="value-pet1">${hasA ? formatStatValue(statKey, av) : '-'}</td><td class="value-pet2">${hasB ? formatStatValue(statKey, bv) : '-'}</td><td>${diff}</td></tr>`;
        });

        parts.push('<div style="margin-top:16px"></div>');
        parts.push('<table>\n<thead><tr><th>스탯</th><th>칩 1</th><th>칩 2</th><th>차이</th></tr></thead><tbody>');
        parts.push(rows.join('\n'));
        parts.push('</tbody></table>');

        area.innerHTML = parts.join('\n');
    }

    function onSelectionChange() {
        const equipType = el('slot-select').value;
        if (!equipType) {
            el('comparison-area').innerHTML = '<div class="empty-state"><p>장비 슬롯을 먼저 선택하세요.</p></div>';
            return;
        }
        const chip1Id = parseId(el('chip1-select').value);
        const chip1Level = parseInt(el('chip1-level').value || '0', 10);
        if (!chip1Id) {
            el('comparison-area').innerHTML = '<div class="empty-state"><p>칩 1을 선택하세요.</p></div>';
            return;
        }
        const chipA = chipById(chip1Id);
        const chip2Id = parseId(el('chip2-select').value);
        if (!chip2Id) {
            renderSingle(chipA, chip1Level, equipType);
            return;
        }
        const chipB = chipById(chip2Id);
        let chip2Level = parseInt(el('chip2-level').value || '0', 10);
        let inherited = false;
        if (chip2LevelWasAutoMapped) inherited = true;
        const mapped = expToLevel(chipB, accumulatedExp(chipA, chip1Level));
        if (!inherited && chip2Level === mapped && parseInt(el('chip2-level').getAttribute('data-auto') || '-1', 10) === mapped) {
            inherited = true;
        }

        renderComparison(chipA, chip1Level, chipB, chip2Level, inherited, equipType);
    }

    Promise.all([
        fetch(CHIP_JSON).then((response) => response.json()),
        fetch(LANG_JSON).then((response) => response.json()).catch(() => ({})),
    ])
        .then(([data, lang]) => {
            statMeta = lang.stat_meta || {};
            equipLabels = Object.assign({}, EQUIP_LABELS, lang.equipment_types || {});
            slotLabels = lang.slot_keys || {};
            buffLabels = lang.BUFF || lang.buff || {};
            chips = data.map((entry) => ({
                chip_id: entry.chip_id,
                name: (lang.chips && (lang.chips[String(entry.chip_id)] || lang.chips[entry.chip_id])) || entry.name || `칩_${entry.chip_id}`,
                slot_id: entry.slot_id,
                slot_key: entry.slot_key,
                slot_name_key: entry.slot_name_key,
                equipment_options: entry.equipment_options || {},
                exp_requirements: entry.exp_requirements || {}
            }));

            statMeta["BUFF"] = {
                "label": "버프",
                "format": "raw"
            }

            const slotSelect = el('slot-select');
            const chip1 = el('chip1-select');
            const chip2 = el('chip2-select');

            chip1.disabled = true;
            chip2.disabled = true;

            const allEquipTypes = Array.from(
                new Set(chips.flatMap((chip) => Object.keys(chip.equipment_options || {})))
            ).sort((a, b) => getEquipOrderIndex(a) - getEquipOrderIndex(b) || (equipLabels[a] || a).localeCompare(equipLabels[b] || b));

            allEquipTypes.forEach((equipType) => {
                const option = document.createElement('option');
                option.value = equipType;
                option.textContent = equipLabels[equipType] || equipType;
                slotSelect.appendChild(option);
            });

            slotSelect.addEventListener('change', () => {
                chip1.value = '';
                el('chip1-level').innerHTML = '<option value="0">+0</option>';
                el('chip1-level').disabled = true;
                chip2.value = '';
                el('chip2-level').innerHTML = '<option value="0">+0</option>';
                el('chip2-level').disabled = true;
                buildChip1Options(slotSelect.value);
                buildChip2Options(slotSelect.value, null, 0);
                onSelectionChange();
            });

            chip1.addEventListener('change', () => {
                const id = parseId(chip1.value);
                const levelSel = el('chip1-level');
                if (!id) {
                    levelSel.innerHTML = '<option value="0">+0</option>';
                    levelSel.disabled = true;
                    buildChip2Options(slotSelect.value, null, 0);
                    onSelectionChange();
                    return;
                }
                const chip = chipById(id);
                const max = getMaxLevelForChip(chip, slotSelect.value);
                populateLevelSelect(levelSel, 0, max, 0, false);
                levelSel.disabled = false;
                buildChip2Options(slotSelect.value, id, parseInt(levelSel.value || '0', 10));
                el('chip2-select').value = '';
                el('chip2-level').innerHTML = '<option value="0">+0</option>';
                el('chip2-level').disabled = true;
                chip2LevelWasAutoMapped = false;
                onSelectionChange();
            });

            el('chip1-level').addEventListener('change', () => {
                const chip1Id = parseId(el('chip1-select').value);
                const chip1Level = parseInt(el('chip1-level').value || '0', 10);
                const equipType = slotSelect.value;
                
                if (!chip1Id) return;
                
                const chipA = chipById(chip1Id);
                const chip1MaxLevel = getMaxLevelForChip(chipA, equipType);
                const chip1AtMaxLevel = chip1Level >= chip1MaxLevel;
                
                buildChip2Options(equipType, chip1Id, chip1Level);
                
                const chip2Id = parseId(el('chip2-select').value);
                if (chip2Id) {
                    const chipB = chipById(chip2Id);
                    
                    if (chip1AtMaxLevel && chipA.chip_id === chipB.chip_id) {
                        el('chip2-select').value = '';
                        el('chip2-level').innerHTML = '<option value="0">+0</option>';
                        el('chip2-level').disabled = true;
                    } else {
                        const chip2MaxLevel = getMaxLevelForChip(chipB, equipType);
                        
                        if (chipB.chip_id === chipA.chip_id) {
                            const start = Math.min(chip2MaxLevel, chip1Level + 1);
                            if (start <= chip2MaxLevel) {
                                populateLevelSelect(el('chip2-level'), start, chip2MaxLevel, start, start);
                            } else {
                                el('chip2-level').innerHTML = '';
                            }
                        } else {
                            const chip1Accum = accumulatedExp(chipA, chip1Level);
                            const mapped = expToLevel(chipB, chip1Accum);
                            const floor = Math.max(0, Math.min(mapped, chip2MaxLevel));
                            const shouldMark = chip1Level >= 1 ? mapped : undefined;
                            populateLevelSelect(el('chip2-level'), floor, chip2MaxLevel, Math.min(mapped, chip2MaxLevel), shouldMark);
                            el('chip2-level').setAttribute('data-auto', String(mapped));
                            chip2LevelWasAutoMapped = true;
                        }
                        el('chip2-level').disabled = false;
                    }
                }
                onSelectionChange();
            });

            el('chip2-select').addEventListener('change', () => {
                const id = parseId(el('chip2-select').value);
                const level2 = el('chip2-level');
                level2.disabled = true;
                level2.innerHTML = '<option value="0">+0</option>';
                chip2LevelWasAutoMapped = false;
                if (!id) {
                    onSelectionChange();
                    return;
                }
                const chip1Id = parseId(el('chip1-select').value);
                const chipA = chipById(chip1Id);
                const chipB = chipById(id);
                const chip1Level = parseInt(el('chip1-level').value || '0', 10);
                const max = getMaxLevelForChip(chipB, slotSelect.value);
                if (chipB.chip_id === chipA.chip_id) {
                    const start = Math.min(max, chip1Level + 1);
                    if (start <= max) populateLevelSelect(level2, start, max, start, start);
                    else level2.innerHTML = '';
                } else {
                    const chip1Accum = accumulatedExp(chipA, chip1Level);
                    const mapped = expToLevel(chipB, chip1Accum);
                    const floor = Math.max(0, Math.min(mapped, max));
                    const shouldMark = chip1Level >= 1 ? mapped : undefined;
                    populateLevelSelect(level2, floor, max, Math.min(mapped, max), shouldMark);
                    level2.setAttribute('data-auto', String(mapped));
                    chip2LevelWasAutoMapped = true;
                }
                level2.disabled = false;
                onSelectionChange();
            });

            el('chip2-level').addEventListener('change', () => {
                chip2LevelWasAutoMapped = false;
                el('chip2-level').removeAttribute('data-auto');
                onSelectionChange();
            });
        })
        .catch((error) => {
            el('comparison-area').innerHTML = `<div class="empty-state"><p>데이터 로드 실패: ${error}</p></div>`;
        });
})();