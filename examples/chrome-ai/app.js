class ChromeAI {
    constructor() {
        this.promptSession = null;
        this.summarizerInstance = null;
        this.proofreaderInstance = null;
        this.rewriterInstance = null;
        this.lastAvailability = {};
        this.isAIAvailable = false;

        this.init();
    }

    async init() {
        await this.checkAIAvailability();
        this.setupEventListeners();
    }

    async checkAIAvailability() {
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');

        statusText.textContent = 'Checking AI availability...';
        statusDot.className = 'status-dot checking';

        if (!window.isSecureContext) {
            statusText.textContent = 'Error: Built-in AI requires a secure context (https or localhost).';
            statusDot.className = 'status-dot error';
            return false;
        }

        const hasAI =
            !!window.LanguageModel ||
            !!window.Summarizer ||
            !!window.Rewriter ||
            !!window.Proofreader ||
            !!window.Proofread ||
            !!window.Prompt;
        if (!hasAI) {
            statusText.textContent = 'Error: Your browser does not support Chrome Built-in AI. Please use Chrome 138+.';
            statusDot.className = 'status-dot error';
            return false;
        }

        try {
            const availability = await this.checkAvailability();
            const promptAvailability =
                this.normalizeAvailability(availability.prompt) ||
                this.normalizeAvailability(availability.languageModel);
            const summarizerAvailability = this.normalizeAvailability(availability.summarizer);
            const proofreaderAvailability = this.normalizeAvailability(availability.proofreader);
            const rewriterAvailability = this.normalizeAvailability(availability.rewriter);

            const promptPresent =
                !!window.Prompt?.create ||
                !!window.LanguageModel?.create;
            const summarizerPresent = !!window.Summarizer?.create;
            const proofreaderPresent =
                !!window.Proofread?.create || !!window.Proofreader?.create;
            const rewriterPresent = !!window.Rewriter?.create;

            const promptEnabled = promptPresent && !this.isUnavailableStatus(promptAvailability);
            const summarizerEnabled = summarizerPresent && !this.isUnavailableStatus(summarizerAvailability);
            const proofreaderEnabled = proofreaderPresent && !this.isUnavailableStatus(proofreaderAvailability);
            const rewriterEnabled =
                (rewriterPresent && !this.isUnavailableStatus(rewriterAvailability)) || promptEnabled;

            this.setButtonEnabled('promptBtn', promptEnabled);
            this.setButtonEnabled('summarizeBtn', summarizerEnabled);
            this.setButtonEnabled('proofreadBtn', proofreaderEnabled);
            this.setButtonEnabled('rewriteBtn', rewriterEnabled);

            this.isAIAvailable = promptEnabled || summarizerEnabled || proofreaderEnabled || rewriterEnabled;

            const anyReady =
                this.isReadyStatus(promptAvailability) ||
                this.isReadyStatus(summarizerAvailability) ||
                this.isReadyStatus(proofreaderAvailability) ||
                this.isReadyStatus(rewriterAvailability);
            const anyDownloadable =
                this.isDownloadableStatus(promptAvailability) ||
                this.isDownloadableStatus(summarizerAvailability) ||
                this.isDownloadableStatus(proofreaderAvailability) ||
                this.isDownloadableStatus(rewriterAvailability);
            const anyPresent = promptPresent || summarizerPresent || proofreaderPresent || rewriterPresent;

            this.lastAvailability = {
                prompt: promptAvailability,
                summarizer: summarizerAvailability,
                proofreader: proofreaderAvailability,
                rewriter: rewriterAvailability
            };

            const rewriterFallback =
                promptEnabled && (!rewriterPresent || this.isUnavailableStatus(rewriterAvailability));
            const summary = this.buildStatusSummary({
                prompt: promptAvailability,
                summarizer: summarizerAvailability,
                proofreader: proofreaderAvailability,
                rewriter: rewriterAvailability,
                rewriterFallback: rewriterFallback
            });

            if (anyReady) {
                statusText.textContent = summary;
                statusDot.className = 'status-dot success';
            } else if (anyDownloadable) {
                statusText.textContent = `AI models need to be downloaded. Click enabled buttons to start. ${summary}`;
                statusDot.className = 'status-dot pending';
            } else if (anyPresent) {
                statusText.textContent = `AI status unknown. ${summary}`;
                statusDot.className = 'status-dot pending';
            } else {
                statusText.textContent = 'AI not available (hardware or space insufficient)';
                statusDot.className = 'status-dot error';
            }

            return true;
        } catch (error) {
            statusText.textContent = `Error checking AI: ${error.message}`;
            statusDot.className = 'status-dot error';
            return false;
        }
    }

    async checkAvailability() {
        const availability = {};

        if (window.Prompt?.availability) {
            availability.prompt = await this.safeCall(() => window.Prompt.availability());
        } else if (window.LanguageModel?.availability) {
            availability.languageModel = await this.safeCall(() => window.LanguageModel.availability());
        } else if (window.LanguageModel?.capabilities) {
            availability.languageModel = await this.safeCall(() => window.LanguageModel.capabilities());
        }

        if (window.Summarizer?.availability) {
            availability.summarizer = await this.safeCall(() => window.Summarizer.availability());
        } else if (window.Summarizer?.capabilities) {
            availability.summarizer = await this.safeCall(() => window.Summarizer.capabilities());
        }

        if (window.Rewriter?.availability) {
            availability.rewriter = await this.safeCall(() => window.Rewriter.availability());
        } else if (window.Rewriter?.capabilities) {
            availability.rewriter = await this.safeCall(() => window.Rewriter.capabilities());
        }

        if (window.Proofread?.availability) {
            availability.proofreader = await this.safeCall(() => window.Proofread.availability());
        } else if (window.Proofreader?.availability) {
            availability.proofreader = await this.safeCall(() => window.Proofreader.availability());
        } else if (window.Proofreader?.capabilities) {
            availability.proofreader = await this.safeCall(() => window.Proofreader.capabilities());
        }

        return availability;
    }

    setButtonEnabled(id, enabled) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !enabled;
        }
    }

    async getPromptSession() {
        if (!this.promptSession) {
            if (this.isUnavailableStatus(this.lastAvailability.prompt)) {
                throw new Error('Prompt API unavailable on this device.');
            }
            if (window.Prompt?.create) {
                this.ensureUserActivation('Prompt');
                this.promptSession = await window.Prompt.create();
            } else if (window.LanguageModel?.create) {
                this.ensureUserActivation('Prompt');
                this.promptSession = await window.LanguageModel.create();
            } else {
                throw new Error('Prompt API not available in this browser.');
            }
        }
        return this.promptSession;
    }

    async getSummarizer() {
        if (!this.summarizerInstance) {
            const type = document.getElementById('summaryType').value;
            const format = document.getElementById('summaryFormat').value;
            if (this.isUnavailableStatus(this.lastAvailability.summarizer)) {
                throw new Error('Summarizer unavailable on this device.');
            }

            if (window.Summarizer?.create) {
                this.ensureUserActivation('Summarizer');
                this.summarizerInstance = await window.Summarizer.create({
                    type: type,
                    format: format,
                    length: 'medium'
                });
                return this.summarizerInstance;
            }
            throw new Error('Summarizer API not available in this browser.');
        }
        return this.summarizerInstance;
    }

    async getProofreader() {
        if (!this.proofreaderInstance) {
            if (this.isUnavailableStatus(this.lastAvailability.proofreader)) {
                throw new Error('Proofreader unavailable on this device.');
            }
            if (window.Proofread?.create) {
                this.ensureUserActivation('Proofreader');
                this.proofreaderInstance = await window.Proofread.create();
                return this.proofreaderInstance;
            }
            if (window.Proofreader?.create) {
                this.ensureUserActivation('Proofreader');
                this.proofreaderInstance = await window.Proofreader.create();
                return this.proofreaderInstance;
            }
            throw new Error('Proofreader API not available in this browser.');
        }
        return this.proofreaderInstance;
    }

    async getRewriter() {
        if (!this.rewriterInstance) {
            const rewriterUnavailable = this.isUnavailableStatus(this.lastAvailability.rewriter);

            if (window.Rewriter?.create && !rewriterUnavailable) {
                this.ensureUserActivation('Rewriter');
                // The new API creates instance without options
                if (window.Rewriter.length === 0) {
                    this.rewriterInstance = await window.Rewriter.create();
                } else {
                    // Fallback for older API if create expects arguments (length check is a heurisitc)
                    // But based on user snippet, use no args.
                    this.rewriterInstance = await window.Rewriter.create();
                }
            } else {
                const session = await this.getPromptSession();
                this.rewriterInstance = {
                    fallback: true,
                    rewrite: async (text, options) => {
                        const tone = options?.tone || 'neutral';
                        const length = options?.length || 'same'; // map 'same' if needed
                        const instruction = `Rewrite the following text.\nTone: ${tone}.\nLength: ${length}.\n\n${text}`;
                        const result = await session.prompt(instruction);
                        return { output: result.output || result };
                    }
                };
            }
        }
        return this.rewriterInstance;
    }

    setupEventListeners() {
        this.setupTabs();
        this.setupPromptButton();
        this.setupSummarizeButton();
        this.setupProofreadButton();
        this.setupRewriteButton();

        document.getElementById('summaryType').addEventListener('change', () => {
            this.summarizerInstance = null;
        });

        document.getElementById('summaryFormat').addEventListener('change', () => {
            this.summarizerInstance = null;
        });

        document.getElementById('rewriteTone').addEventListener('change', () => {
            this.rewriterInstance = null;
        });

        document.getElementById('rewriteLength').addEventListener('change', () => {
            this.rewriterInstance = null;
        });
    }

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;

                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(tabId).classList.add('active');
            });
        });
    }

    setupPromptButton() {
        const btn = document.getElementById('promptBtn');
        const input = document.getElementById('promptInput');
        const output = document.getElementById('promptOutput');

        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) {
                output.innerHTML = '<p class="error">Please enter a prompt or question.</p>';
                return;
            }

            this.setLoading(btn, output, true);

            try {
                const session = await this.getPromptSession();
                const result = await session.prompt(text);
                const outputText = result.output || result;
                output.innerHTML = `<pre class="result">${this.escapeHtml(outputText)}</pre>`;
            } catch (error) {
                output.innerHTML = `<p class="error">Prompt failed: ${error.message}</p>`;
            } finally {
                this.setLoading(btn, output, false);
            }
        });
    }

    setupSummarizeButton() {
        const btn = document.getElementById('summarizeBtn');
        const input = document.getElementById('summarizeInput');
        const output = document.getElementById('summarizeOutput');

        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) {
                output.innerHTML = '<p class="error">Please enter text to summarize.</p>';
                return;
            }

            this.setLoading(btn, output, true);

            try {
                const summarizer = await this.getSummarizer();
                const result = await summarizer.summarize(text);

                const formatted = this.formatSummarizeResult(result);
                output.innerHTML = formatted;
            } catch (error) {
                output.innerHTML = `<p class="error">Summarization failed: ${error.message}</p>`;
            } finally {
                this.setLoading(btn, output, false);
            }
        });
    }

    setupProofreadButton() {
        const btn = document.getElementById('proofreadBtn');
        const input = document.getElementById('proofreadInput');
        const output = document.getElementById('proofreadOutput');

        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) {
                output.innerHTML = '<p class="error">Please enter text to proofread.</p>';
                return;
            }

            this.setLoading(btn, output, true);

            try {
                const proofreader = await this.getProofreader();
                // Check if we should use proofread() or check()
                let result;
                if (proofreader.proofread) {
                    result = await proofreader.proofread(text);
                } else {
                    result = await proofreader.check(text);
                }

                if (result.correctedInput) {
                    // New API: returns corrected text
                    output.innerHTML = `<pre class="result">${this.escapeHtml(result.correctedInput)}</pre>`;
                } else if (result.errors && result.errors.length === 0) {
                    output.innerHTML = '<p class="success">No errors found! Your text is correct.</p>';
                } else if (result.errors) {
                    let html = '<div class="proofread-results">';
                    html += `<h3>Found ${result.errors.length} error(s):</h3>`;
                    html += '<ul class="errors-list">';

                    result.errors.forEach(error => {
                        html += `<li>
                            <strong>Error:</strong> ${error.type}<br>
                            <span class="highlight">${this.escapeHtml(error.span)}</span><br>
                            <strong>Suggestion:</strong> ${this.escapeHtml(error.suggestions.join(', '))}
                        </li>`;
                    });

                    html += '</ul></div>';
                    output.innerHTML = html;
                }
            } catch (error) {
                output.innerHTML = `<p class="error">Proofreading failed: ${error.message}</p>`;
            } finally {
                this.setLoading(btn, output, false);
            }
        });
    }

    setupRewriteButton() {
        const btn = document.getElementById('rewriteBtn');
        const input = document.getElementById('rewriteInput');
        const output = document.getElementById('rewriteOutput');

        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) {
                output.innerHTML = '<p class="error">Please enter text to rewrite.</p>';
                return;
            }

            this.setLoading(btn, output, true);

            try {
                const rewriter = await this.getRewriter();
                const tone = document.getElementById('rewriteTone').value;
                const length = document.getElementById('rewriteLength').value;

                let result;
                // If it's our fallback object or new API supporting options in rewrite
                if (rewriter.fallback || rewriter.rewrite.length >= 2 || (window.Rewriter && rewriter instanceof window.Rewriter)) {
                    result = await rewriter.rewrite(text, {
                        tone: tone,
                        length: length
                    });
                } else {
                    // Older API might have baked options in create, so just call rewrite(text)
                    // But since we changed create() to no-args, we assume new API mostly.
                    // If the environment is mixed, this might be tricky.
                    // Let's assume the snippet is the truth: rewrite(text, options).
                    result = await rewriter.rewrite(text, {
                        tone: tone,
                        length: length
                    });
                }

                const outputText = result.output || result;
                output.innerHTML = `<pre class="result">${this.escapeHtml(outputText)}</pre>`;
            } catch (error) {
                output.innerHTML = `<p class="error">Rewriting failed: ${error.message}</p>`;
            } finally {
                this.setLoading(btn, output, false);
            }
        });
    }

    setLoading(btn, output, isLoading) {
        if (isLoading) {
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.dataset.originalText = originalText;
            btn.textContent = 'Processing...';
            output.innerHTML = '<p class="loading">AI is working on it...</p>';
        } else {
            btn.disabled = false;
            btn.textContent = btn.dataset.originalText;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatSummarizeResult(result) {
        if (typeof result === 'string') {
            return `<pre class="result">${this.escapeHtml(result)}</pre>`;
        }
        if (result && typeof result === 'object') {
            const outputText =
                typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? result, null, 2);
            const formatText = typeof result.format === 'string' ? result.format : null;
            if (formatText) {
                return `<p>Format: ${this.escapeHtml(formatText)}</p><pre class="result">${this.escapeHtml(outputText)}</pre>`;
            }
            return `<pre class="result">${this.escapeHtml(outputText)}</pre>`;
        }
        return `<pre class="result">${this.escapeHtml(String(result))}</pre>`;
    }

    normalizeAvailability(value) {
        if (value === true) {
            return 'available';
        }
        if (value === false) {
            return 'unavailable';
        }
        if (!value) {
            return null;
        }
        if (typeof value === 'string') {
            return value.toLowerCase();
        }
        if (typeof value === 'object') {
            if (typeof value.available === 'string') {
                return value.available.toLowerCase();
            }
            if (typeof value.status === 'string') {
                return value.status.toLowerCase();
            }
            if (typeof value.availability === 'string') {
                return value.availability.toLowerCase();
            }
        }
        return null;
    }

    isReadyStatus(status) {
        return status === 'readily' || status === 'available';
    }

    isDownloadableStatus(status) {
        return status === 'downloadable' || status === 'downloading' || status === 'after-download';
    }

    isUnavailableStatus(status) {
        return status === 'unavailable' || status === 'no';
    }

    buildStatusSummary(statuses) {
        const promptStatus = this.formatStatus(statuses.prompt);
        const summarizerStatus = this.formatStatus(statuses.summarizer);
        const proofreaderStatus = this.formatStatus(statuses.proofreader);
        const rewriterStatus = statuses.rewriterFallback
            ? 'prompt fallback'
            : this.formatStatus(statuses.rewriter);
        return `Prompt: ${promptStatus} | Summarize: ${summarizerStatus} | Proofread: ${proofreaderStatus} | Rewrite: ${rewriterStatus}`;
    }

    formatStatus(status) {
        if (this.isReadyStatus(status)) {
            return 'ready';
        }
        if (this.isDownloadableStatus(status)) {
            return status === 'downloading' ? 'downloading' : 'downloadable';
        }
        if (status === 'unavailable' || status === 'no') {
            return 'unavailable';
        }
        if (!status) {
            return 'unknown';
        }
        return status;
    }

    async safeCall(fetcher) {
        try {
            return await fetcher();
        } catch (error) {
            return null;
        }
    }

    ensureUserActivation(featureName) {
        if (navigator.userActivation && !navigator.userActivation.isActive) {
            throw new Error(`${featureName} requires user activation. Click the button to continue.`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChromeAI();
});
