document.addEventListener('DOMContentLoaded', () => {
	const togglePassword = document.getElementById('toggle-password');
	const passwordField  = document.getElementById('password-field');
	const loginBtn       = document.getElementById('login-btn');
	const idField        = document.getElementById('id-field');

	// 비밀번호 보기/숨김
	togglePassword.addEventListener('click', function () {
		const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
		passwordField.setAttribute('type', type);
		this.textContent = type === 'password' ? '보기' : '숨김';
	});

  	// 로그인 버튼
  	loginBtn.addEventListener('click', function (e) {
		e.preventDefault();

		const id = idField.value.trim();
		const password = passwordField.value;

		if (!id || !password) {
		alert("아이디와 비밀번호를 입력하세요!");
		return;
		}

		// ?next= 파라미터 읽기
		const params = new URLSearchParams(window.location.search);
		const next   = params.get('next');

		// next를 쿼리스트링으로 넘기기
		const url = next ? `/login_check?next=${encodeURIComponent(next)}` : '/login_check';

		fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',                 // 세션 쿠키 사용
			body: JSON.stringify({ id, password, next }) 
		})
		.then(res => res.json())
		.then(data => {
			if (data.success) {
				window.location.href = data.next || "/";
			} else {
				alert("아이디와 비밀번호를 확인해주세요.");
			}
		})
		.catch(err => {
			console.error("Error:", err);
			alert("서버 오류 발생");
		});
  	});
});
