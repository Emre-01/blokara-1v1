document.querySelector('[data-local="coop"]').click();
new Promise(function (resolve) {
  setTimeout(function () {
    document.querySelector('#game-menu').click();
    setTimeout(function () { resolve('ok'); }, 400);
  }, 600);
});
