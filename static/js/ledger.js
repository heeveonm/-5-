// HTML 요소 가져오기
const calendarDiv = document.getElementById('calendar');
const inputTitle = document.getElementById('input-title');
const form = document.getElementById('entry-form');
const applyBtn = document.getElementById('apply-btn');
const listDiv = document.getElementById('transaction-list');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const currentMonthTitle = document.getElementById('current-month');

// 상태 관리
let selectedDate = null;
let currentDate = new Date();

// 페이지가 처음 로드될 때 실행될 함수
document.addEventListener('DOMContentLoaded', async () => {
    renderCalendar(currentDate);
});

/**
 * 달력을 생성하고 화면에 렌더링하는 함수
 */
function renderCalendar(date) {
    calendarDiv.innerHTML = '';
    const year = date.getFullYear();
    const month = date.getMonth();
    currentMonthTitle.textContent = `${year}년 ${month + 1}월`;
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.classList.add('day', 'empty');
        calendarDiv.appendChild(emptyDay);
    }
    for (let i = 1; i <= totalDays; i++) {
        const day = document.createElement('div');
        day.classList.add('day');
        day.textContent = i;
        day.onclick = () => selectDate(year, month, i);
        calendarDiv.appendChild(day);
    }
}

/**
 * 현재 날짜의 목록을 새로고침하는 헬퍼 함수
 */
async function refreshCurrentList() {
    if (!selectedDate) return;
    // selectedDate는 "YYYY-MM-DD" 형식의 문자열입니다.
    const [year, month, day] = selectedDate.split('-').map(Number);
    // JS의 Date 객체는 month를 0~11로 사용하므로 1을 빼줍니다.
    await selectDate(year, month - 1, day);
}

/**
 * 날짜를 선택했을 때 호출되는 함수
 */
async function selectDate(year, month, day) {
    document.getElementById('input-container').classList.remove('centered-prompt');
    listDiv.style.display = 'block';

    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    selectedDate = `${year}-${monthStr}-${dayStr}`;
    
    inputTitle.textContent = `${selectedDate} 내역 입력`;
    form.style.display = 'flex';

    // 날짜를 클릭하면 해당 날짜의 API를 호출
    try {
        const res = await fetch(`/transactions-by-date?date=${selectedDate}`);
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || '데이터를 불러오는 데 실패했습니다.');
        }
        const data = await res.json();
        updateList(data.transactions || []); 
    } catch (error) {
        console.error('Error fetching date-specific transactions:', error);
        listDiv.innerHTML = `<h3>거래 내역</h3><p style="color: red;">${error.message}</p>`;
    }
}

// "이전 달", "다음 달" 버튼 클릭 이벤트
prevMonthBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
};
nextMonthBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
};

// "적용" 버튼 클릭 시
applyBtn.onclick = async () => {
    const type = document.getElementById('type').value;
    const desc = document.getElementById('desc').value;
    const amount = document.getElementById('amount').value;

    if (!type || !desc || !amount || !selectedDate) {
        return alert('모든 항목을 입력하세요.');
    }

    try {
        const res = await fetch('/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ date: selectedDate, type, desc, amount })
        });
        
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || '등록에 실패했습니다.');
        }

        // 입력창 초기화
        document.getElementById('type').value = '';
        document.getElementById('desc').value = '';
        document.getElementById('amount').value = '';

    } catch (error) {
        console.error('Error adding transaction:', error);
        alert(error.message); 
    }
    
    // 목록 새로고침
    await refreshCurrentList();
};

// '삭제', '수정', '저장', '취소' 버튼 클릭을 감지하는 이벤트 리스너
listDiv.addEventListener('click', async function(event) {
    const target = event.target;
    const tr = target.closest('tr'); // 버튼이 속한 행(tr)
    if (!tr) return;

    const transactionId = tr.dataset.id; // 행에 저장된 ID

    // '삭제' 버튼 클릭 시
    if (target.classList.contains('delete-btn')) {
        if (transactionId) {
            await handleDelete(transactionId);
        }
    }
    
    // '수정' 버튼 클릭 시
    if (target.classList.contains('edit-btn')) {
        toggleEditMode(tr, true); // 수정 모드로 변경
    }
    
    // '저장' 버튼 클릭 시
    if (target.classList.contains('save-btn')) {
        if (transactionId) {
            await handleSave(tr, transactionId);
        }
    }

    // '취소' 버튼 클릭 시
    if (target.classList.contains('cancel-btn')) {
        toggleEditMode(tr, false); // '표시 모드'로 되돌리기
    }
});

/**
 * '수정' <-> '저장' 모드 전환 함수
 */
function toggleEditMode(tr, isEditing) {
    // tr 안의 모든 '표시용' 필드와 '수정용' 필드를 찾습니다.
    const displayFields = tr.querySelectorAll('.display-field');
    const editFields = tr.querySelectorAll('.edit-field');
    
    // 버튼들을 찾습니다.
    const editBtn = tr.querySelector('.edit-btn');
    const deleteBtn = tr.querySelector('.delete-btn');
    const saveBtn = tr.querySelector('.save-btn');
    const cancelBtn = tr.querySelector('.cancel-btn'); // 취소 버튼 찾기

    // 모드에 따라 숨기거나 보여줍니다.
    displayFields.forEach(f => f.style.display = isEditing ? 'none' : '');
    editFields.forEach(f => f.style.display = isEditing ? '' : 'none');
    
    editBtn.style.display = isEditing ? 'none' : '';
    deleteBtn.style.display = isEditing ? 'none' : '';
    saveBtn.style.display = isEditing ? '' : 'none';
    cancelBtn.style.display = isEditing ? '' : 'none'; // 취소 버튼 숨김/표시
}

/**
 * '저장' 버튼 클릭 시 서버로 전송하는 함수
 */
async function handleSave(tr, transactionId) {
    // 수정용 input/select 에서 새 값 가져오기
    const newDate = tr.querySelector('.edit-date').value;
    const newType = tr.querySelector('.edit-type').value;
    const newDesc = tr.querySelector('.edit-description').value;
    const newAmount = tr.querySelector('.edit-amount').value;
    
    if (!newDate || !newType || !newDesc || newAmount === '') {
        return alert('모든 항목을 입력하세요.');
    }

    try {
        const res = await fetch('/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: transactionId, 
                date: newDate, 
                type: newType, 
                desc: newDesc, // app.py가 받을 이름 (desc)
                amount: newAmount 
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || '수정에 실패했습니다.');
        }
    } catch (err) {
        console.error('Error saving transaction:', err);
        alert(err.message);
    }

    // 목록 새로고침
    await refreshCurrentList();
}


/**
 * '삭제' 함수
 */
async function handleDelete(transactionId) {
    
    if (!confirm('정말로 이 내역을 삭제하시겠습니까?')) {
        return;
    }

    try { 
        const res = await fetch('/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: transactionId }) 
        });
        
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || '삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        alert(error.message); 
    }
    
    // 목록 새로고침
    await refreshCurrentList();
}

/**
 * 거래 내역 리스트 업데이트 함수
 */
function updateList(transactions) {
    console.log(transactions); // (디버깅용)
    if (transactions.length === 0) {
        listDiv.innerHTML = `<h3>거래 내역</h3><p>해당 날짜의 거래 내역이 없습니다.</p>`;
        return;
    }

    let html = `
    <h3>거래 내역</h3>
    <table>
        <thead><tr><th>날짜</th><th>유형</th><th>내역</th><th>금액</th><th></th></tr></thead>
        <tbody>
        ${transactions.map(t => {
            const transactionId = t.id; 
            const amount = parseInt(t.amount); // 금액 파싱
            const displayDate = (t.date || '').split('T')[0]; // 예: "2025-11-04T..." -> "2025-11-04"

            return `
                <tr data-id="${transactionId}">
                    
                    <td>
                        <span class="display-field">${displayDate}</span>
                        <input type="date" class="edit-field edit-date" value="${displayDate}" style="display:none;">
                    </td> 
                    
                    <td>
                        <span class="display-field">${t.type}</span>
                        <select class="edit-field edit-type" style="display:none;">
                            <option value="입금" ${t.type === '입금' ? 'selected' : ''}>입금</option>
                            <option value="출금" ${t.type === '출금' ? 'selected' : ''}>출금</option>
                        </select>
                    </td>
                    
                    <td>
                        <span class="display-field">${t.description}</span>
                        <input type="text" class="edit-field edit-description" value="${t.description || ''}" style="display:none;">
                    </td> 
                    
                    <td class="${t.type === '입금' ? 'deposit' : ''}">
                        <span class="display-field">${amount.toLocaleString()} 원</span>
                        <input type="number" class="edit-field edit-amount" value="${amount}" style="display:none;">
                    </td>
                    
                    <td>
                        <button class="edit-btn">&#9999;</button> 
                        <button class="save-btn" style="display:none;">저장</button>
                        <button class="cancel-btn" style="display:none;">취소</button>
                        <button class="delete-btn" data-id='${transactionId}'>&times;</button>
                    </td>
                </tr>
            `;
        }).join('')}
        </tbody>
    </table>
    `;
    listDiv.innerHTML = html;
}