import { addAnchorLink } from '../../scripts/scripts.js';
import { toClassName } from '../../scripts/lib-franklin.js';

const blockCollectionInfo = {
  owner: 'adobe',
  repo: 'helix-block-collection',
  ref: 'doc-block',
};
const blockCollectionBaseUrl = `https://${blockCollectionInfo.ref}--${blockCollectionInfo.repo}--${blockCollectionInfo.owner}.hlx.live/block-collection/`;
const adminApiUrl = `https://admin.hlx.page/status/${blockCollectionInfo.owner}/${blockCollectionInfo.repo}/${blockCollectionInfo.ref}/block-collection/`;

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

const getScaffolding = (blockName) => {
  const inner = document.createElement('div');
  inner.classList.add('doc-block-inner');

  const example = document.createElement('div');
  example.classList.add('block-example');
  example.innerHTML = `
    <h2 id="${toClassName(`${blockName}-block-example`)}">Example</h2>  
    <iframe 
      src="${blockCollectionBaseUrl}${blockName}"
      title="${blockName}"
      class="block-example"
      allowfullscreen=""
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      loading="lazy">
    </iframe>
    <p class="button-container">
      <a href="${blockCollectionBaseUrl}${blockName}" title="See Live Example" class="button primary" target="_blank">See Live Example</a>
    </p>
  `;
  inner.appendChild(example);

  const contentStructure = document.createElement('div');
  contentStructure.classList.add('block-content-stucture');
  contentStructure.innerHTML = `
    <h2 id="${toClassName(`${blockName}-block-content-structure`)}">Content Structure</h2>
    <div class="block-content-stucture-display"></div>
  `;
  inner.appendChild(contentStructure);

  inner.querySelectorAll('h2').forEach((h2) => addAnchorLink(h2));

  return inner;
};

const fetchContentStucture = async (blockName, contentStructureContainer) => {
  const response = await fetch(`${blockCollectionBaseUrl}${blockName}.plain.html`);
  if (response.ok) {
    const html = await response.text();
    const dp = new DOMParser();
    const doc = dp.parseFromString(html, 'text/html');
    const blockExamples = doc.querySelectorAll(`.${blockName}`);
    const docWrapper = document.createElement('div');
    docWrapper.classList.add('document-wrapper');
    contentStructureContainer.appendChild(docWrapper);
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
      let maxcols = 0;
      rows.forEach((row) => {
        const tr = document.createElement('tr');
        const cols = row.querySelectorAll(':scope > div');
        const numCols = cols.length;
        if (numCols > maxcols) maxcols = numCols;
        cols.forEach((col) => {
          const td = document.createElement('td');
          td.append(transformBlockContent(col));
          tr.appendChild(td);
        });
        table.querySelector('tbody').appendChild(tr);
      });
      table.querySelector('thead > tr > th').setAttribute('colspan', maxcols);
      table.querySelectorAll('tbody > tr').forEach((tr) => {
        const tds = tr.querySelectorAll(':scope > td');
        if (tds.length < maxcols) {
          tds[0].setAttribute('colspan', maxcols - tds.length + 1);
        }
      });
      docWrapper.appendChild(table);
    });
  } else {
    throw new Error('failed to fetch block content');
  }

  const adminApiResp = await fetch(`${adminApiUrl}${blockName}?editUrl=auto`);
  if (adminApiResp.ok) {
    const json = await adminApiResp.json();
    if (json && json.edit && json.edit.status === 200 && json.edit.url) {
      const editUrl = json.edit.url;
      contentStructureContainer.innerHTML += `
          <a href="${editUrl}" title="See Document" class="button primary" target="_blank">See Document</a>
        `;
    }
  }
};

export default async function decorate(block) {
  // block name provided as block content or from url slug
  const blockName = block.textContent.trim() || window.location.pathname.split('/').pop();
  const scaffolding = getScaffolding(blockName);
  block.replaceChildren(scaffolding);
  const contentStructureDisplay = block.querySelector('.block-content-stucture-display');

  try {
    fetchContentStucture(blockName, contentStructureDisplay);
  } catch (e) {
    contentStructureDisplay.innerHTML = '<p>Failed to load block content</p>';
  }
}
