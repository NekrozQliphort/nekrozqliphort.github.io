export function toc() {
  if (document.querySelector('main h1')) {
    // see: https://github.com/tscanlin/tocbot#usage
    tocbot.init({
      tocSelector: '#toc',
      contentSelector: '.content',
      ignoreSelector: '[data-toc-skip]',
      headingSelector: 'h1',
      orderedList: false,
      scrollSmooth: false
    });

    document.getElementById('toc-wrapper').classList.remove('d-none');
  }
}
