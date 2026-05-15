(function () {
  const { algoliasearch, instantsearch } = window;

  let escolasHelper;
  let selectedMunicipio;

  const selectedMunicipioContainer = document.querySelector(
    '#selectedMunicipioEscolas'
  );

  const hasSearchValue = (value) =>
    typeof value === 'string' && value.trim() !== '';

  const hasFilterValue = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return Boolean(value);
  };

  const hasRelevantSearchParams = (params) =>
    hasSearchValue(params.query) ||
    hasFilterValue(params.filters) ||
    hasFilterValue(params.facetFilters) ||
    hasFilterValue(params.numericFilters) ||
    hasFilterValue(params.tagFilters);

  const formatEducationType = (educationType) => {
    const labels = {
      education_basic: 'Ensino básico',
      education_university: 'Ensino superior',
    };

    return labels[educationType] || educationType || 'Tipo não informado';
  };

  const formatAddress = (hit) => {
    const addressParts = [
      hit.entityAddress,
      hit.entityAddressNumber,
      hit.entityComplement,
      hit.entityNeighborhood,
    ].filter(Boolean);

    return addressParts.length
      ? addressParts.join(', ')
      : 'Endereço não informado';
  };

  const getMunicipioState = (hit) =>
    hit.microrregiao &&
    hit.microrregiao.mesorregiao &&
    hit.microrregiao.mesorregiao.UF
      ? hit.microrregiao.mesorregiao.UF.sigla
      : '';

  const getMunicipioCode = (hit) =>
    hit.id || hit.codigo_ibge || hit.codigoIbge || hit.municipalityCod || '';

  const getMunicipalityFilter = (code) => `municipalityCod:"${String(code)}"`;

  const renderSelectedMunicipio = () => {
    if (!selectedMunicipioContainer) {
      return;
    }

    selectedMunicipioContainer.replaceChildren();

    if (!selectedMunicipio) {
      selectedMunicipioContainer.className = 'municipio-filter is-empty';
      selectedMunicipioContainer.textContent =
        'Escolha um município na lista ao lado para filtrar as escolas.';
      return;
    }

    selectedMunicipioContainer.className = 'municipio-filter';

    const label = document.createElement('span');
    label.textContent = `Escolas em ${selectedMunicipio.name}${
      selectedMunicipio.state ? `/${selectedMunicipio.state}` : ''
    } (IBGE ${selectedMunicipio.code})`;

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.id = 'clearMunicipioFilter';
    clearButton.textContent = 'Limpar filtro';

    selectedMunicipioContainer.append(label, clearButton);
  };

  const applyMunicipioFilter = () => {
    console.log('applyMunicipioFilter', { selectedMunicipio, escolasHelper } )
    if (!escolasHelper) {
      return;
    }

    if (!selectedMunicipio) {
      escolasHelper.setQueryParameter('filters', undefined);
      escolasHelper.setPage(0).search();
      return;
    }

    console.log('getMunicipalityFilter', getMunicipalityFilter(selectedMunicipio.code))
    escolasHelper.setQueryParameter(
      'filters',
      getMunicipalityFilter(selectedMunicipio.code)
    );
    escolasHelper.setPage(0).search();
  };

  const selectMunicipio = ({ code, name, state }) => {
    selectedMunicipio = { code, name, state };
    renderSelectedMunicipio();
    applyMunicipioFilter();
  };

  const clearMunicipioFilter = () => {
    selectedMunicipio = undefined;
    renderSelectedMunicipio();
    applyMunicipioFilter();
  };

  const algoliaClient = algoliasearch(
    'HWH30FGJ0N',
    '0728f0307fe562beb15cc785340456bf'
  );

  const searchClient = {
    ...algoliaClient,
    search(requests) {
      // Retorna vazio apenas quando nao existe texto nem filtro aplicado.
      if (
        requests.every((request) => !hasRelevantSearchParams(request.params))
      ) {
        return Promise.resolve({
          results: requests.map(() => ({
            hits: [],
            nbHits: 0,
            nbPages: 0,
            page: 0,
            processingTimeMS: 0,
            hitsPerPage: 0,
            exhaustiveNbHits: true,
            query: '',
            params: '',
          })),
        });
      }

      return algoliaClient.search(requests);
    },
  };

  const searchMunicipios = instantsearch({
    indexName: 'municipios',
    stalledSearchDelay: 1500,
    searchClient,
    future: { preserveSharedStateOnUnmount: true },
  });

  searchMunicipios.addWidgets([
    instantsearch.widgets.searchBox({
      container: '#searchboxMunicipios',
      placeholder: 'Digite o nome do município ou estado',
      showLoadingIndicator: true,
    }),
    instantsearch.widgets.hits({
      container: '#hitsMunicipios',
      templates: {
        item: (hit, { html, components }) => html`
          <article
            class="municipio-hit"
            role="button"
            tabindex="0"
            data-municipality-code="${getMunicipioCode(hit)}"
            data-municipality-name="${hit.nome}"
            data-municipality-state="${getMunicipioState(hit)}"
          >
            <div>
              <h1>${components.Highlight({ hit, attribute: 'nome' })}</h1>
              <p>
                ${components.Highlight({
                  hit,
                  attribute: 'microrregiao.mesorregiao.UF.sigla',
                })}
              </p>
              <!-- ${JSON.stringify(hit)} -->
            </div>
          </article>
        `,
      },
    }),
    instantsearch.widgets.configure({
      // hitsPerPage: 8,
    }),
    // instantsearch.widgets.pagination({
    //   container: '#paginationMunicipios',
    // }),
  ]);

  searchMunicipios.start();

  renderSelectedMunicipio();

  document.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const selectButton = target.closest('.select-municipio-button');
    const municipioHit = target.closest('.municipio-hit');

    if (selectButton || municipioHit) {
      const selectedTarget = selectButton || municipioHit;
      selectMunicipio({
        code: selectedTarget.dataset.municipalityCode,
        name: selectedTarget.dataset.municipalityName,
        state: selectedTarget.dataset.municipalityState,
      });
      return;
    }

    if (target.closest('#clearMunicipioFilter')) {
      clearMunicipioFilter();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const municipioHit = target.closest('.municipio-hit');

    if (!municipioHit) {
      return;
    }

    event.preventDefault();

    selectMunicipio({
      code: municipioHit.dataset.municipalityCode,
      name: municipioHit.dataset.municipalityName,
      state: municipioHit.dataset.municipalityState,
    });
  });

  const searchEscolas = instantsearch({
    indexName: 'escolas',
    stalledSearchDelay: 1500,
    searchClient,
    future: { preserveSharedStateOnUnmount: true },
  });

  searchEscolas.addWidgets([
    instantsearch.widgets.searchBox({
      container: '#searchboxEscolas',
      showLoadingIndicator: true,
      placeholder: 'Digite o nome da escola ou código INEP',
    }),
    {
      init({ helper }) {
        escolasHelper = helper;
        applyMunicipioFilter();
      },
    },
    instantsearch.widgets.hits({
      container: '#hitsEscolas',
      templates: {
        item: (hit, { html, components }) => html`
          <article>
            <div>
              <h1>${components.Highlight({ hit, attribute: 'entityName' })}</h1>
              <p>
                <strong>INEP:</strong>
                ${components.Highlight({ hit, attribute: 'entityInep' })}
              </p>
              <p>
                <strong>Tipo:</strong> ${formatEducationType(
                  hit.education_type
                )}
              </p>
              <p>
                <strong>Local:</strong> ${hit.municipalityName ||
                'Município não informado'}${hit.state ? `/${hit.state}` : ''}
              </p>
              <p>
                <strong>Dependência:</strong> ${hit.entityDependence ||
                hit.entityType ||
                'Não informada'}
              </p>
              <p><strong>Endereço:</strong> ${formatAddress(hit)}</p>
            </div>
          </article>
        `,
      },
    }),
    // instantsearch.widgets.configure({
    //   hitsPerPage: 8,
    // }),
    // instantsearch.widgets.pagination({
    //   container: '#paginationEscolas',
    // }),
  ]);

  searchEscolas.start();
})();
