const blockCollectionBaseUrl = 'https://main--helix-block-collection--adobe.hlx.live/block-collection/';
const blockCollectionGitUrl = 'https://github.com/adobe/helix-block-collection';

const transformBlockContent = (element) => {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('/')) {
      a.setAttribute('href', `${blockCollectionBaseUrl}${href}`);
    }
  });
  clone.querySelectorAll('picture').forEach((pic) => {
    const img = pic.querySelector('img');
    const src = img.getAttribute('src');
    if (src.startsWith('/') || src.startsWith('./')) {
      img.setAttribute('src', `${blockCollectionBaseUrl}${src}`);
    }
    pic.querySelectorAll('source').forEach((source) => {
      const srcset = source.getAttribute('srcset');
      if (srcset.startsWith('/') || srcset.startsWith('./')) {
        source.setAttribute('srcset', `${blockCollectionBaseUrl}${srcset}`);
      }
    });
  });
  return clone;
};

export default async function decorate(block) {
  const blockName = window.location.pathname.split('/').pop();
  block.innerHTML = `
        <h2>Example</h2>  
        <iframe 
          src="${blockCollectionBaseUrl}${blockName}"
          title="${blockName}"
          class="block-example"
          style="border: 0; top: 0; left: 0; width: 100%; height: 100vh;" 
          allowfullscreen=""
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          loading="lazy">
        </iframe>
        <p class="button-container">
          <a href="${blockCollectionBaseUrl}${blockName}" title="See Live Example" class="button primary" target="_blank">See Live Example</a>
        </p>
        <h2>Content Structure</h2>
        <div class="block-content-stucture">
        </div>
       </p>
        <h2>Code</h2>
        <p>This code is included in Block Collection, simply copying the <code>.css</code> file and the <code>.js</code> file will add this block to your project.</p>
        <p class="button-container">
          <a href="${blockCollectionGitUrl}/tree/main/blocks/video" title="Block Code" class="button primary" target="_blank">Block Code</a>
        </p>
      `;
  const blockExampleContainer = block.querySelector('.block-content-stucture');
  try {
    const response = await fetch(`${blockCollectionBaseUrl}${blockName}.plain.html`);
    if (response.ok) {
      const html = await response.text();
      const dp = new DOMParser();
      const doc = dp.parseFromString(html, 'text/html');
      const blockExamples = doc.querySelectorAll(`.${blockName}`);
      blockExamples.forEach((example) => {
        const table = document.createElement('table');
        table.innerHTML = `
          <thead>
            <tr>
              <th>${example.className.split(' ').map((cls) => `${cls.charAt(0).toUpperCase()}${cls.substring(1)}`).join(' ')}</th>
            </tr>
          </thead>
          <tbody>
          </tbody>
        `;
        const rows = example.querySelectorAll(':scope > div');
        rows.forEach((row) => {
          const tr = document.createElement('tr');
          const cols = row.querySelectorAll(':scope > div');
          cols.forEach((col) => {
            const td = document.createElement('td');
            td.append(transformBlockContent(col));
            tr.appendChild(td);
          });
          table.querySelector('tbody').appendChild(tr);
        });
        blockExampleContainer.appendChild(table);
      });
    } else {
      throw new Error('failed to fetch block content');
    }
  } catch (e) {
    blockExampleContainer.innerHTML = '<p>Failed to load block content</p>';
  }
}
