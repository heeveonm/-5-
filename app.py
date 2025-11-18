
# --- 1. 라이브러리 및 모듈 임포트 ---
import modules.user as user_db       # 'modules/user.py'를 user_db 별명으로 가져옴
import modules.ledger as ledger_db   # 'modules/ledger.py'를 ledger_db 별명으로 가져옴
import modules.config as config           # 'modules/config.py'를 config 별명으로 가져옴
from modules.ledger import select_ledger_by_user, select_transactions_by_date
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from datetime import timedelta, date # 날짜/시간 처리를 위함
from functools import wraps
from calendar import monthrange      # 특정 월의 일수를 계산하기 위함


# ====================== 2. Flask 앱 초기화 및 설정 ======================
app = Flask(__name__)

# 세션(로그인 상태 유지 등)을 사용하기 위한 비밀 키 (config.py에서 가져옴)
app.secret_key = config.secret  
# 세션(로그인)이 유지되는 시간 설정 (6시간)
app.permanent_session_lifetime = timedelta(hours=6)

# 세션 쿠키의 보안 관련 설정
app.config.update(
    SESSION_COOKIE_HTTPONLY=True, # JavaScript로 쿠키 접근 방지
    SESSION_COOKIE_SAMESITE="Lax" # CSRF 공격 방지를 위한 설정
    # SESSION_COOKIE_SECURE=True # (HTTPS 배포 시 활성화)
)


# ====================== 3. 전처리 함수 (모든 요청 전에 실행) ======================

# 모든 HTML 템플릿('{{ username }}')에서 세션 값을 바로 사용할 수 있도록 변수를 주입
@app.context_processor
def inject_user():
    return {
        'username': session.get('username'),
        'id': session.get('id')
    }

# (중요) 모든 페이지 요청이 들어오기 직전에 실행되어 로그인 여부를 검사
@app.before_request
def require_login_for_all_except_public():
    # 로그인이 필요 없는 페이지(엔드포인트) 목록
    public_endpoints = {'login_view', 'login', 'static'}  
    ep = (request.endpoint or '').split('.')[0] # 현재 요청된 엔드포인트 이름

    # 요청된 페이지가 public_endpoints에 속하면, 검사 없이 통과
    if ep in public_endpoints:
        return 

    # (핵심) 세션에 'id'가 없으면 (즉, 로그인이 안 되어 있으면)
    if not session.get('id'):
        # 만약 API(JSON) 요청이었다면 (예: /add), JSON으로 에러 메시지 반환
        if request.is_json or request.path.startswith(('/add', '/delete', '/transactions')):
            return jsonify(success=False, message='Login required'), 401
        # 일반 페이지 요청이었다면, 로그인 페이지로 강제 리디렉션
        return redirect(url_for('login_view', next=request.path))

# ====================== 4. 페이지 뷰 라우팅 (HTML 렌더링) ======================

# 메인 페이지 ('/')
@app.route('/')
def index():
    # 로그인 되어 있으면 가계부 페이지로, 아니면 로그인 페이지로 보냄
    if session.get('id'):
        return redirect(url_for('ledger_view'))
    return render_template('login.html')

# 로그인 페이지 뷰
@app.route('/login')
def login_view():
    # 이미 로그인했다면 가계부 페이지로 보냄
    if session.get('id'):
        return redirect(url_for('ledger_view'))
    return render_template('login.html')

# 가계부 메인 페이지 뷰
@app.route('/ledger')
def ledger_view():
    # (@before_request가 이미 로그인 여부를 검사했으므로, 이 함수는 실행됨)
    return render_template('ledger.html')

# 통계 페이지 뷰
@app.route('/statistics')
def statistics_view():
    # (@before_request가 이미 로그인 여부를 검사했으므로, 이 함수는 실행됨)
    return render_template('statistics.html')

# ====================== 5. 가계부 API (데이터 처리) ======================

# (API) 가계부 내역 '전체' 조회 (참고: 현재 ledger.js는 이 API를 사용하지 않음)
@app.route('/transactions')
def get_transactions():
    user_id = session.get('id')
    # DB에서 해당 사용자의 '모든' 내역 조회
    transactions_list = ledger_db.select_ledger_by_user(user_id)
    
    # 날짜 객체(date object)를 문자열로 변환 (JSON 전송을 위해)
    for item in transactions_list:
        if 'date' in item and hasattr(item['date'], 'isoformat'):
            item['date'] = item['date'].isoformat()
            
    return jsonify({'transactions': transactions_list})

# (API) 가계부 내역 '날짜별' 조회 (ledger.js의 selectDate 함수가 호출)
@app.route('/transactions-by-date')
def get_transactions_by_date():
    """
    [핵심 API] 'date' 파라미터를 받아 해당 날짜의 내역만 반환
    """
    user_id = session.get('id') # 로그인 세션 ID
    if not user_id:
        return jsonify(success=False, message='Login required'), 401

    # URL 쿼리 파라미터에서 'date' 값을 가져옴 (예: ...?date=2025-10-29)
    selected_date = request.args.get('date')
    if not selected_date:
        return jsonify({"error": "Date parameter is required"}), 400

    # DB에서 해당 날짜의 데이터만 조회 (ledger.py의 함수 호출)
    transactions_list = ledger_db.select_transactions_by_date(user_id, selected_date)
    
    # 날짜 객체 문자열로 변환
    for item in transactions_list:
        if 'date' in item and hasattr(item['date'], 'isoformat'):
            item['date'] = item['date'].isoformat()
    
    return jsonify({'transactions': transactions_list})

# (API) 가계부 내역 '추가' (ledger.js의 applyBtn.onclick이 호출)
@app.route('/add', methods=['POST'])
def add_transaction():
    """ 새로운 거래 내역을 DB에 추가합니다. """
    
    # (핵심) 로그인 시 저장한 'id' 키로 세션에서 사용자 ID를 올바르게 가져옴
    user_id = session.get('id')
    if not user_id:
        return jsonify({'error': '로그인이 필요합니다.'}), 401
        
    if request.is_json:
        data = request.get_json() # JS가 보낸 JSON 데이터 (date, type, desc, amount)
        try:
            # DB에 새 내역 삽입 (ledger.py의 함수 호출)
            ledger_db.insert_transaction(
                user_id,
                data.get('date'),
                data.get('type'),
                data.get('desc'),
                data.get('amount'),
                category=None # (카테고리 기능은 아직 없으므로 None)
            )
            
            latest_transactions = ledger_db.select_ledger_by_user(user_id)
            for item in latest_transactions:
                if 'date' in item and hasattr(item['date'], 'isoformat'):
                    item['date'] = item['date'].isoformat()

            return jsonify({'transactions': latest_transactions})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    return jsonify({"error": "Request must be JSON"}), 400

# (API) 가계부 내역 '삭제' (ledger.js의 handleDelete가 호출)
@app.route('/delete', methods=['POST'])
def delete_transaction():
    """ 요청받은 ID의 거래 내역을 DB에서 삭제합니다. """
    
    # (핵심) 로그인 시 저장한 'id' 키로 세션에서 사용자 ID를 올바르게 가져옴
    user_id = session.get('id')
    if not user_id:
        return jsonify({'error': '로그인이 필요합니다.'}), 401
        
    if request.is_json:
        data = request.get_json()
        transaction_id = data.get('id') # JS에서 보낸 삭제할 내역의 ID
        
        try:
            # DB에서 해당 내역 삭제 (ledger.py의 함수 호출)
            ledger_db.delete_transaction_by_id(transaction_id, user_id)
            
            latest_transactions = ledger_db.select_ledger_by_user(user_id)
            for item in latest_transactions:
                if 'date' in item and hasattr(item['date'], 'isoformat'):
                    item['date'] = item['date'].isoformat()
            
            return jsonify({'transactions': latest_transactions})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return jsonify({"error": "Request must be JSON"}), 400

# (API) 가계부 내역 '수정' (ledger.js의 handleSave가 호출)
@app.route('/edit', methods=['POST'])
def edit_transaction():
    """ (신규) 요청받은 ID의 거래 내역을 DB에서 수정합니다. """
    
    user_id = session.get('id')
    if not user_id:
        return jsonify({'error': '로그인이 필요합니다.'}), 401
        
    if request.is_json:
        data = request.get_json()
        
        # JS에서 보낸 4가지 새 값 + 1개 ID
        transaction_id = data.get('id')
        new_date = data.get('date')
        new_type = data.get('type')
        new_desc = data.get('desc') # JS에서 'desc'로 보냅니다
        new_amount = data.get('amount')

        # 모든 값이 제대로 왔는지 확인
        if not all([transaction_id, new_date, new_type, new_desc, new_amount is not None]):
             return jsonify({'error': '모든 값이 필요합니다.'}), 400

        try:
            # DB에서 해당 내역 수정 (ledger.py의 함수 호출)
            ledger_db.update_transaction(
                transaction_id, 
                user_id, 
                new_date, 
                new_type, 
                new_desc, 
                new_amount
            )
            
            # (참고) JS가 스스로 목록을 새로고침하므로, 성공 메시지만 반환
            return jsonify({'success': True})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return jsonify({"error": "Request must be JSON"}), 400

  
# ====================== 6. 인증 API (로그인/로그아웃) ======================
# (API) '로그인 실행' (login.js에서 호출)
@app.route('/login_check', methods=['POST'])
def login():
    data = request.get_json()
    id = data.get('id')
    password = data.get('password')

    # (주의!) user.py의 이 함수는 비밀번호 해시(암호화) 비교를 안 하는 테스트용 함수
    result = user_db.select_user_info(id, password)
    if result == None:
        return jsonify(success=False) # 로그인 실패
    
    # (핵심) 로그인 성공 시, 세션에 'id'와 'username' 키로 정보 저장
    session['id'] = result['id']       
    session['username'] = result['user_name']   
    session.permanent = True # 세션 유지 시간(6시간) 적용
    
    nxt = request.args.get('next') or data.get('next')

    if not nxt or not nxt.startswith('/'):
        nxt = url_for('index')
    # 로그인 성공 및 리디렉션할 경로('next') 반환
    return jsonify(success=True, next=nxt)

# (API) '로그아웃 실행'
@app.route('/logout', methods=['GET', 'POST'])
def logout():
    session.clear() # 세션의 모든 정보 (id, username) 삭제
    return redirect(url_for('login_view')) # 로그인 페이지로 리디렉션
    
# ====================== 7. 통계 API (statistics.js에서 호출) ======================

# (API) 통계 - 월간 누적 지출 (꺾은선 그래프용)
@app.route('/api/stats/monthly-total')
def stats_monthly_total():
    user_id = session.get('id')

    # URL 파라미터(예: ?year=2025&month=10)가 없으면 오늘 날짜 기준
    today = date.today()
    year = int(request.args.get('year', today.year))
    month = int(request.args.get('month', today.month))

    # 해당 월의 마지막 날짜 계산 (예: 10월 -> 31일)
    days = monthrange(year, month)[1]
    # 조회할 날짜 범위 설정 (예: 10/1 ~ 11/1)
    start = date(year, month, 1)
    end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)

    # DB에서 통계 데이터 조회 (ledger.py의 함수 호출)
    data = ledger_db.select_month_ledger_by_user(user_id, year, month, days, start, end)
    return jsonify(data)  

# (API) 통계 - 월간 상세 내역 (수입/지출/카드/이체 등)
@app.route('/api/stats/monthly-spend')
def stats_monthly_spend():
    user_id = session.get('id')
    today = date.today()
    year = int(request.args.get('year', today.year))
    month = int(request.args.get('month', today.month))
    days = monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)

    data = ledger_db.select_month_daily_spend_income(user_id, start, end, year, month, days)
    return jsonify(data)

# (API) 통계 - 월간 카테고리별 지출 (원 그래프용)
@app.route('/api/stats/monthly-cats')
def stats_monthly_cats():
    user_id = session.get('id')
    today = date.today()
    year  = int(request.args.get('year',  today.year))
    month = int(request.args.get('month', today.month))
    days  = monthrange(year, month)[1]
    start = date(year, month, 1)
    end   = date(year + (month == 12), 1 if month == 12 else month + 1, 1)

    data = ledger_db.select_month_category_spend(user_id, start, end)
    return jsonify(data)

# (API) 통계 - 주간 순수입 (막대 그래프용)
@app.route('/api/stats/weekly')
def stats_weekly():
    user_id = session.get('id')
    n = int(request.args.get('n', 10)) # 최근 10주가 기본값
    data = ledger_db.select_recent_weeks(user_id, n)
    return jsonify(data)

# ====================== 8. 서버 실행 ======================
if __name__ == "__main__":
    # 'python app.py'로 직접 실행했을 때만 서버 가동
    app.run(debug=True, port=8080)