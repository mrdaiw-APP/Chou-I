(function crowIntegration() {
    if (window.CROW_ENABLED === false) return;
    if (window.__crowIntegrationInitialized) return;
    window.__crowIntegrationInitialized = true;

    const CROW_API_URL = 'https://api.usecrow.ai';
    const CROW_PRODUCT_ID = 'user_3DJuslJWSa838JasjwlNIUbAmJA';
    const CROW_SCRIPT_ID = 'crow-widget-script';
    const HISTORY_STORAGE_KEY = 'iching_stock_history_v41';

    const integrationState = {
        hasResults: false,
        lastAnalysisMode: 'none',
        lastAnalysisAt: null,
        hasOpenedAfterAnalysis: false
    };

    function getEl(id) {
        return document.getElementById(id);
    }

    function getValue(id) {
        const node = getEl(id);
        return node ? node.value : '';
    }

    function setValue(id, value) {
        const node = getEl(id);
        if (!node || typeof value === 'undefined' || value === null) return;
        node.value = value;
        node.dispatchEvent(new Event('change', { bubbles: true }));
        node.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function getHistoryCount() {
        try {
            const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.length : 0;
        } catch (error) {
            return 0;
        }
    }

    function checkResultsVisible() {
        const results = getEl('results');
        if (!results) return false;
        return results.style.display !== 'none' && results.innerHTML.trim().length > 0;
    }

    function buildContext() {
        return {
            currentRoute: window.location.pathname,
            selectedMarket: getValue('market') || 'AUTO',
            stockCodeInput: getValue('stockCode') || '',
            questionType: getValue('questionType') || '',
            advancedModeEnabled: !!getEl('advancedMode')?.checked,
            hasResults: integrationState.hasResults,
            lastAnalysisMode: integrationState.lastAnalysisMode,
            lastAnalysisAt: integrationState.lastAnalysisAt,
            historyCount: getHistoryCount()
        };
    }

    function safeCrow(method, payload) {
        if (typeof window.crow !== 'function') return;
        try {
            if (typeof payload === 'undefined') {
                window.crow(method);
            } else {
                window.crow(method, payload);
            }
        } catch (error) {
            console.warn('Crow call failed:', method, error);
        }
    }

    function refreshContextAndActions() {
        integrationState.hasResults = checkResultsVisible();
        safeCrow('setContext', buildContext());

        if (integrationState.hasResults) {
            safeCrow('setGreeting', '分析结果已生成，我可以继续帮你解读风险、趋势和操作策略。');
            safeCrow('setSuggestedActions', [
                { label: '解读综合评分', message: '请解释这次综合评分和信心等级的含义' },
                { label: '给我风控建议', message: '请基于当前结果给出仓位和止损建议' },
                { label: '再做一次实时分析', message: '请对当前股票执行一次实时分析' }
            ]);
        } else {
            safeCrow('setGreeting', '你好，我可以帮你填写参数并执行易经股票分析。');
            safeCrow('setSuggestedActions', [
                { label: '实时分析当前股票', message: '请帮我执行当前输入的实时分析' },
                { label: '模拟分析当前股票', message: '请帮我执行当前输入的模拟分析' },
                { label: '如何填写问题', message: '请给我一个适合这个系统的问题描述示例' }
            ]);
        }
    }

    function wrapGlobalFunction(name, wrapperFactory) {
        const original = window[name];
        if (typeof original !== 'function' || original.__crowWrapped) return;
        const wrapped = wrapperFactory(original);
        wrapped.__crowWrapped = true;
        window[name] = wrapped;
    }

    function bindAppHooks() {
        ['market', 'stockCode', 'questionType', 'advancedMode'].forEach((id) => {
            const node = getEl(id);
            if (!node) return;
            node.addEventListener('change', refreshContextAndActions);
            node.addEventListener('input', refreshContextAndActions);
        });

        wrapGlobalFunction('performAnalysis', (original) => async function wrappedPerformAnalysis(useRealtime) {
            integrationState.lastAnalysisMode = useRealtime ? 'realtime' : 'mock';
            integrationState.lastAnalysisAt = new Date().toISOString();
            safeCrow('setToolStatus', useRealtime ? '正在执行实时分析...' : '正在执行模拟分析...');

            try {
                const result = await original.apply(this, arguments);
                integrationState.hasResults = checkResultsVisible();
                refreshContextAndActions();
                if (integrationState.hasResults && !integrationState.hasOpenedAfterAnalysis) {
                    integrationState.hasOpenedAfterAnalysis = true;
                    safeCrow('open');
                }
                return result;
            } finally {
                safeCrow('setToolStatus', '');
            }
        });

        wrapGlobalFunction('clearHistory', (original) => function wrappedClearHistory() {
            const result = original.apply(this, arguments);
            refreshContextAndActions();
            return result;
        });
    }

    function registerClientTools() {
        safeCrow('registerTools', {
            updateAnalysisInputs: async ({ stockCode, market, questionType, question }) => {
                setValue('stockCode', stockCode);
                setValue('market', market);
                setValue('questionType', questionType);
                setValue('question', question);
                refreshContextAndActions();
                return {
                    status: 'success',
                    stockCode: getValue('stockCode'),
                    market: getValue('market'),
                    questionType: getValue('questionType')
                };
            },
            runRealtimeAnalysis: async ({ stockCode, market, questionType, question }) => {
                setValue('stockCode', stockCode);
                setValue('market', market);
                setValue('questionType', questionType);
                setValue('question', question);
                await window.performAnalysis(true);
                return {
                    status: 'success',
                    mode: 'realtime',
                    stockCode: getValue('stockCode'),
                    hasResults: checkResultsVisible()
                };
            },
            runMockAnalysis: async ({ stockCode, market, questionType, question }) => {
                setValue('stockCode', stockCode);
                setValue('market', market);
                setValue('questionType', questionType);
                setValue('question', question);
                await window.performAnalysis(false);
                return {
                    status: 'success',
                    mode: 'mock',
                    stockCode: getValue('stockCode'),
                    hasResults: checkResultsVisible()
                };
            },
            setAdvancedMode: async ({ enabled }) => {
                const advancedMode = getEl('advancedMode');
                if (!advancedMode) return { status: 'error', message: 'advanced mode toggle not found' };
                advancedMode.checked = !!enabled;
                advancedMode.dispatchEvent(new Event('change', { bubbles: true }));
                refreshContextAndActions();
                return { status: 'success', enabled: advancedMode.checked };
            },
            clearHistoryRecords: async () => {
                window.clearHistory();
                refreshContextAndActions();
                return { status: 'success', historyCount: getHistoryCount() };
            },
            scrollToResults: async () => {
                const results = getEl('results');
                if (!results) return { status: 'error', message: 'results container not found' };
                results.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return { status: 'success' };
            }
        });
    }

    function waitForCrowReady(timeoutMs) {
        const started = Date.now();
        return new Promise((resolve, reject) => {
            const timer = window.setInterval(() => {
                if (typeof window.crow === 'function') {
                    window.clearInterval(timer);
                    resolve();
                    return;
                }
                if (Date.now() - started > timeoutMs) {
                    window.clearInterval(timer);
                    reject(new Error('Timed out waiting for window.crow'));
                }
            }, 50);
        });
    }

    async function loadCrowWidget() {
        if (typeof window.crow === 'function') return;

        let script = document.getElementById(CROW_SCRIPT_ID);
        if (!script) {
            script = document.createElement('script');
            script.id = CROW_SCRIPT_ID;
            script.src = `${CROW_API_URL}/static/crow-widget.js`;
            script.dataset.productId = CROW_PRODUCT_ID;
            script.dataset.apiUrl = CROW_API_URL;
            document.body.appendChild(script);
        }
        await waitForCrowReady(10000);
    }

    async function initializeCrow() {
        try {
            await loadCrowWidget();
            safeCrow('setIdentityTokenFetcher', async () => {
                try {
                    const response = await fetch('/api/crow-token', { credentials: 'include' });
                    if (!response.ok) return '';
                    const payload = await response.json();
                    return payload?.token || '';
                } catch (error) {
                    return '';
                }
            });
            bindAppHooks();
            registerClientTools();
            refreshContextAndActions();
        } catch (error) {
            console.error('Crow integration failed to initialize:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCrow, { once: true });
    } else {
        initializeCrow();
    }
})();
