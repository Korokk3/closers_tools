const PET_DATA_URL = './data/pet_data.json';
const PET_LANG_URL = './data/pet_lang.json';

let petsData = [];
let langData = { pets: {}, stats: {} };
let statMeta = {};
let comboOptions = [];

function buildComboOptions() {
    const options = [];
    petsData.forEach(function(pet) {
        const petName = langData.pets[String(pet.pet_id)] || ('펫 ' + pet.pet_id);
        for (let stage = 0; stage <= 5; stage += 1) {
            if (!pet.stages || !pet.stages[String(stage)]) {
                continue;
            }
            const stageLabel = stage === 0 ? '0강' : String(stage) + '강';
            options.push({ value: String(pet.pet_id) + ':' + String(stage), petId: String(pet.pet_id), stage: stage, label: petName + ' ' + stageLabel });
        }
    });
    return options;
}

function getStageStats(pet, stage) {
    if (!pet || !pet.stages) {
        return {};
    }
    return pet.stages[String(stage)] || pet.stages[stage] || {};
}

function formatNumber(value) {
    const numericValue = Number(value || 0);
    if (Number.isInteger(numericValue)) {
        return String(numericValue);
    }
    return numericValue.toFixed(2).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}

function formatPercent(value) {
    return formatNumber(Number(value || 0) * 100) + '%';
}

function formatCount(value) {
    return formatNumber(Number(value || 0)) + '개';
}

function getSelectedCombo(selectElement) {
    const value = selectElement.value;
    if (!value) {
        return null;
    }
    const parts = value.split(':');
    return { petId: parts[0], stage: Number(parts[1] || 0), value: value };
}

function findPetById(petId) {
    return petsData.find(function(pet) {
        return String(pet.pet_id) === String(petId);
    });
}

function getStatRowConfigs(statIdx) {
    const meta = statMeta[String(statIdx)] || { label: 'Stat ' + statIdx, kind: 'flat', order: 90 };
    if (meta.kind === 'attack') {
        return [
            { statIdx: statIdx, kind: 'attack_flat', label: meta.label, order: meta.order, sortLabel: meta.label },
            { statIdx: statIdx, kind: 'attack_total', label: '총 ' + meta.label, order: meta.order + 100, sortLabel: meta.label }
        ];
    }
    if (meta.kind === 'percent') {
        return [{ statIdx: statIdx, kind: 'percent', label: meta.label, order: meta.order, sortLabel: meta.label }];
    }
    return [{ statIdx: statIdx, kind: 'flat', label: meta.label, order: meta.order, sortLabel: meta.label }];
}

function getAutoItemSlotCount(stage) {
    if (stage <= 1) {
        return 0;
    }
    return stage - 1;
}

function buildRowList(stats1, stats2) {
    const union = new Set(Object.keys(stats1).concat(Object.keys(stats2)));
    const rows = [];
    union.forEach(function(statIdxText) {
        getStatRowConfigs(statIdxText).forEach(function(row) {
            rows.push(row);
        });
    });
    rows.sort(function(a, b) {
        if (a.order !== b.order) {
            return a.order - b.order;
        }
        return String(a.sortLabel).localeCompare(String(b.sortLabel), 'ko');
    });
    rows.push({ statIdx: '__AUTO_ITEM_SLOTS__', kind: 'auto_item_slots', label: '자동 아이템 사용 슬롯 개수', order: 999, sortLabel: '자동 아이템 사용 슬롯 개수' });
    return rows;
}

function getRowStat(stats, row) {
    const stat = stats[String(row.statIdx)];
    if (!stat) {
        return null;
    }
    return { value: Number(stat[0] || 0), bonus: Number(stat[1] || 0) };
}

function isVisibleRowValue(row, rowStat) {
    if (!rowStat) {
        return false;
    }
    if (row.kind === 'auto_item_slots') {
        return Number(rowStat.value || 0) !== 0;
    }
    if (row.kind === 'attack_total') {
        return Number(rowStat.bonus || 0) !== 0;
    }
    return Number(rowStat.value || 0) !== 0;
}

function formatRowValue(row, rowStat) {
    if (!rowStat) {
        return '';
    }
    if (!isVisibleRowValue(row, rowStat)) {
        return '';
    }
    if (row.kind === 'auto_item_slots') {
        return formatCount(rowStat ? rowStat.value : 0);
    }
    if (row.kind === 'attack_flat') {
        return formatNumber(rowStat.value);
    }
    if (row.kind === 'attack_total') {
        return formatPercent(rowStat.bonus);
    }
    if (row.kind === 'percent') {
        return formatPercent(rowStat.value);
    }
    return formatNumber(rowStat.value);
}

function formatRowDiff(row, diff) {
    if (row.kind === 'auto_item_slots') {
        return (diff > 0 ? '+' : '') + formatNumber(diff) + '개';
    }
    if (row.kind === 'flat' || row.kind === 'attack_flat') {
        return (diff > 0 ? '+' : '') + formatNumber(diff);
    }
    return (diff > 0 ? '+' : '') + formatPercent(diff);
}

function populateSelects() {
    const pet1Select = document.getElementById('pet1-select');
    const pet2Select = document.getElementById('pet2-select');
    const selected1 = pet1Select.value;
    const selected2 = pet2Select.value;
    pet1Select.innerHTML = '<option value="">-- 펫 및 강화단계 선택 --</option>';
    pet2Select.innerHTML = '<option value="">-- 펫 및 강화단계 선택 --</option>';
    comboOptions.forEach(function(combo) {
        if (combo.value !== selected2) {
            const option1 = document.createElement('option');
            option1.value = combo.value;
            option1.textContent = combo.label;
            pet1Select.appendChild(option1);
        }
        if (combo.value !== selected1) {
            const option2 = document.createElement('option');
            option2.value = combo.value;
            option2.textContent = combo.label;
            pet2Select.appendChild(option2);
        }
    });
    if (selected1 && Array.from(pet1Select.options).some(function(option) { return option.value === selected1; })) {
        pet1Select.value = selected1;
    } else {
        pet1Select.value = '';
    }
    if (selected2 && Array.from(pet2Select.options).some(function(option) { return option.value === selected2; })) {
        pet2Select.value = selected2;
    } else {
        pet2Select.value = '';
    }
}

function updateComparison() {
    populateSelects();
    const pet1Select = document.getElementById('pet1-select');
    const pet2Select = document.getElementById('pet2-select');
    const combo1 = getSelectedCombo(pet1Select);
    const combo2 = getSelectedCombo(pet2Select);
    if (!combo1 || !combo2) {
        document.getElementById('comparison-area').innerHTML = '<div class="empty-state"><p>서로 다른 두 개의 펫을 선택하세요</p></div>';
        return;
    }
    if (combo1.value === combo2.value) {
        document.getElementById('comparison-area').innerHTML = '<div class="empty-state"><p>같은 펫과 같은 강화단계는 비교할 수 없습니다.</p></div>';
        return;
    }
    const pet1 = findPetById(combo1.petId);
    const pet2 = findPetById(combo2.petId);
    generateComparisonTable(pet1, combo1.stage, pet2, combo2.stage);
}

function generateComparisonTable(pet1, stage1, pet2, stage2) {
    const stats1 = getStageStats(pet1, stage1);
    const stats2 = getStageStats(pet2, stage2);
    const rows = buildRowList(stats1, stats2);
    if (!rows.length) {
        document.getElementById('comparison-area').innerHTML = '<div class="empty-state"><p>표시할 스탯이 없습니다.</p></div>';
        return;
    }
    let html = '<table><thead><tr><th>능력치</th><th>펫 1</th><th>펫 2</th><th>비교</th></tr></thead><tbody>';
    rows.forEach(function(row) {
        let rowStat1 = getRowStat(stats1, row);
        let rowStat2 = getRowStat(stats2, row);
        if (row.kind === 'auto_item_slots') {
            rowStat1 = { value: getAutoItemSlotCount(stage1), bonus: 0 };
            rowStat2 = { value: getAutoItemSlotCount(stage2), bonus: 0 };
        }
        if (!isVisibleRowValue(row, rowStat1) && !isVisibleRowValue(row, rowStat2)) {
            return;
        }
        const value1 = row.kind === 'attack_total' ? Number(rowStat1 ? rowStat1.bonus : 0) : Number(rowStat1 ? rowStat1.value : 0);
        const value2 = row.kind === 'attack_total' ? Number(rowStat2 ? rowStat2.bonus : 0) : Number(rowStat2 ? rowStat2.value : 0);
        const diff = value2 - value1;
        const diffClass = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff' : '';
        html += '<tr>' +
            '<td class="stat-name">' + row.label + '</td>' +
            '<td class="value-pet1">' + formatRowValue(row, rowStat1) + '</td>' +
            '<td class="value-pet2">' + formatRowValue(row, rowStat2) + '</td>' +
            '<td class="' + diffClass + '">' + formatRowDiff(row, diff) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('comparison-area').innerHTML = html;
}

async function loadData() {
    const [petsResponse, langResponse] = await Promise.all([
        fetch(PET_DATA_URL),
        fetch(PET_LANG_URL),
    ]);

    if (!petsResponse.ok) {
        throw new Error('pet_data.json load failed');
    }
    if (!langResponse.ok) {
        throw new Error('pet_lang.json load failed');
    }

    petsData = await petsResponse.json();
    langData = await langResponse.json();
    statMeta = langData.stats || {};
    comboOptions = buildComboOptions();

    document.getElementById('pet1-select').addEventListener('change', updateComparison);
    document.getElementById('pet2-select').addEventListener('change', updateComparison);
    populateSelects();
}

loadData().catch(function(error) {
    document.getElementById('comparison-area').innerHTML = '<div class="empty-state"><p>데이터 로드 실패: ' + error.message + '</p></div>';
});