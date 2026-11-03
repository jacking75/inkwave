const launch = document.getElementById('launch');
launch?.addEventListener('click', () => {
  // 저장된 선호 설정은 변경하지 않고 기존 URL 오버라이드만 사용한다.
  window.location.assign('./index.html?quality=low');
});
