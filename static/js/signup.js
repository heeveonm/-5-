document.addEventListener('DOMContentLoaded', () => {
    const togglePassword      = document.getElementById('signup-toggle-password');
    const passwordField       = document.getElementById('signup-password');
    const passwordConfirmField= document.getElementById('signup-password-confirm');
    const signupBtn           = document.getElementById('signup-btn');
    const idField             = document.getElementById('signup-id');
    const nameField           = document.getElementById('signup-name');
    const emailField          = document.getElementById('signup-email');
    const form                = document.getElementById('signup-form');

    // 비밀번호 보기/숨김
    togglePassword.addEventListener('click', function () {
        const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordField.setAttribute('type', type);
        this.textContent = type === 'password' ? '보기' : '숨김';
    });

    // 회원가입 버튼
    signupBtn.addEventListener('click', function (e) {
        e.preventDefault();

        const id       = idField.value.trim();
        const name     = nameField.value.trim();
        const email    = emailField.value.trim();
        const password = passwordField.value;
        const confirm  = passwordConfirmField.value;

        // 간단한 UI 검증 (필요하면 팀 규칙에 맞게 더 추가)
        if (!id || !name || !email || !password || !confirm) {
            alert("모든 정보를 입력해주세요!");
            return;
        }

        if (password.length < 8) {
            alert("비밀번호는 8자 이상이어야 합니다.");
            return;
        }

        if (password !== confirm) {
            alert("비밀번호가 서로 일치하지 않습니다.");
            return;
        }

        // 지금은 UI만이라서 여기서 끝
        // 백엔드랑 연동할 땐 fetch('/signup', {...}) 이런 식으로 POST 날리면 됨.
        alert("회원가입 정보가 유효합니다! (현재는 UI만 구현)");
        form.reset();
    });
});
