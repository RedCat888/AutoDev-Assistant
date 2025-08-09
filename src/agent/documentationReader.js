const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Documentation Reader
 * Reads and understands project documentation before making changes
 * Integrates local docs, code comments, and online API documentation
 */
class DocumentationReader {
  constructor(config = {}) {
    this.config = config;
    this.projectRoot = config.projectRoot || process.cwd();
    this.docsCache = new Map();
    this.apiDocsCache = new Map();
    this.codeCommentsCache = new Map();
    
    // Common documentation locations
    this.docPaths = [
      'docs',
      'documentation',
      'README.md',
      'CONTRIBUTING.md',
      'API.md',
      'ARCHITECTURE.md',
      '.github/docs',
      'wiki'
    ];
    
    // File patterns to extract comments from
    this.codePatterns = {
      javascript: /\.(js|jsx|ts|tsx)$/,
      python: /\.py$/,
      java: /\.java$/,
      cpp: /\.(cpp|cc|h|hpp)$/,
      csharp: /\.cs$/,
      go: /\.go$/,
      rust: /\.rs$/
    };
    
    // API documentation sources
    this.apiDocSources = {
      'react': 'https://react.dev/reference',
      'node': 'https://nodejs.org/api',
      'express': 'https://expressjs.com/en/api.html',
      'electron': 'https://www.electronjs.org/docs',
      'typescript': 'https://www.typescriptlang.org/docs',
      'python': 'https://docs.python.org/3/',
      'tensorflow': 'https://www.tensorflow.org/api_docs',
      'pytorch': 'https://pytorch.org/docs'
    };
  }

  /**
   * Read all relevant documentation for a task
   * @param {Object} context - Task context
   * @returns {Object} Aggregated documentation
   */
  async readDocumentationForTask(context) {
    const { filePath, taskType, technology, query } = context;
    
    const documentation = {
      local: {},
      comments: {},
      api: {},
      relevant: [],
      summary: ''
    };
    
    try {
      // 1. Read local project documentation
      documentation.local = await this.readLocalDocs(filePath, taskType);
      
      // 2. Extract relevant code comments
      documentation.comments = await this.extractCodeComments(filePath);
      
      // 3. Fetch API documentation if needed
      if (technology) {
        documentation.api = await this.fetchAPIDocumentation(technology, query);
      }
      
      // 4. Find most relevant sections
      documentation.relevant = this.findRelevantSections(documentation, query);
      
      // 5. Generate summary
      documentation.summary = this.summarizeDocumentation(documentation.relevant);
      
      return documentation;
    } catch (error) {
      console.error('Documentation reading error:', error);
      return documentation;
    }
  }

  /**
   * Read local project documentation
   * @param {string} filePath - File being worked on
   * @param {string} taskType - Type of task
   * @returns {Object} Local documentation
   */
  async readLocalDocs(filePath, taskType) {
    const docs = {};
    
    // Check cache first
    const cacheKey = `local_${filePath}_${taskType}`;
    if (this.docsCache.has(cacheKey)) {
      return this.docsCache.get(cacheKey);
    }
    
    // Read README files
    const readmePaths = [
      path.join(this.projectRoot, 'README.md'),
      path.join(path.dirname(filePath || this.projectRoot), 'README.md')
    ];
    
    for (const readmePath of readmePaths) {
      if (fs.existsSync(readmePath)) {
        docs.readme = fs.readFileSync(readmePath, 'utf-8');
        break;
      }
    }
    
    // Read docs directory
    const docsDir = path.join(this.projectRoot, 'docs');
    if (fs.existsSync(docsDir)) {
      docs.projectDocs = await this.readDocsDirectory(docsDir, taskType);
    }
    
    // Read architecture documentation
    const archPaths = [
      path.join(this.projectRoot, 'ARCHITECTURE.md'),
      path.join(this.projectRoot, 'docs', 'architecture.md'),
      path.join(this.projectRoot, 'docs', 'design.md')
    ];
    
    for (const archPath of archPaths) {
      if (fs.existsSync(archPath)) {
        docs.architecture = fs.readFileSync(archPath, 'utf-8');
        break;
      }
    }
    
    // Read API documentation
    const apiPaths = [
      path.join(this.projectRoot, 'API.md'),
      path.join(this.projectRoot, 'docs', 'api.md'),
      path.join(this.projectRoot, 'docs', 'API.md')
    ];
    
    for (const apiPath of apiPaths) {
      if (fs.existsSync(apiPath)) {
        docs.api = fs.readFileSync(apiPath, 'utf-8');
        break;
      }
    }
    
    // Read contributing guidelines
    const contribPath = path.join(this.projectRoot, 'CONTRIBUTING.md');
    if (fs.existsSync(contribPath)) {
      docs.contributing = fs.readFileSync(contribPath, 'utf-8');
    }
    
    // Read package.json for dependencies and scripts
    const packagePath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      docs.dependencies = packageJson.dependencies;
      docs.scripts = packageJson.scripts;
      docs.projectInfo = {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description
      };
    }
    
    // Cache the results
    this.docsCache.set(cacheKey, docs);
    
    return docs;
  }

  /**
   * Read documentation directory recursively
   * @param {string} docsDir - Documentation directory path
   * @param {string} taskType - Type of task
   * @returns {Object} Documentation content
   */
  async readDocsDirectory(docsDir, taskType) {
    const docs = {};
    
    try {
      const files = fs.readdirSync(docsDir);
      
      for (const file of files) {
        const filePath = path.join(docsDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Recursively read subdirectories
          docs[file] = await this.readDocsDirectory(filePath, taskType);
        } else if (file.endsWith('.md') || file.endsWith('.txt')) {
          // Read documentation files
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileName = path.basename(file, path.extname(file));
          
          // Prioritize relevant docs based on task type
          if (this.isRelevantDoc(fileName, taskType)) {
            docs[fileName] = {
              content,
              path: filePath,
              priority: this.getDocPriority(fileName, taskType)
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error reading docs directory ${docsDir}:`, error);
    }
    
    return docs;
  }

  /**
   * Extract code comments from source files
   * @param {string} filePath - File to extract comments from
   * @returns {Object} Extracted comments
   */
  async extractCodeComments(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return {};
    }
    
    // Check cache
    if (this.codeCommentsCache.has(filePath)) {
      return this.codeCommentsCache.get(filePath);
    }
    
    const comments = {
      fileHeader: null,
      functions: {},
      classes: {},
      important: [],
      todos: [],
      warnings: []
    };
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Extract different types of comments based on file type
      const ext = path.extname(filePath);
      
      if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
        this.extractJavaScriptComments(lines, comments);
      } else if (ext === '.py') {
        this.extractPythonComments(lines, comments);
      } else if (ext === '.java' || ext === '.cs') {
        this.extractJavaStyleComments(lines, comments);
      }
      
      // Also extract from related files (test files, type definitions)
      const baseName = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      
      // Check for test file
      const testPaths = [
        path.join(dir, `${baseName}.test${ext}`),
        path.join(dir, `${baseName}.spec${ext}`),
        path.join(dir, '__tests__', `${baseName}${ext}`)
      ];
      
      for (const testPath of testPaths) {
        if (fs.existsSync(testPath)) {
          comments.tests = await this.extractTestDescriptions(testPath);
          break;
        }
      }
      
      // Check for type definitions
      if (ext === '.js') {
        const typesPath = path.join(dir, `${baseName}.d.ts`);
        if (fs.existsSync(typesPath)) {
          comments.types = await this.extractTypeDefinitions(typesPath);
        }
      }
      
      // Cache results
      this.codeCommentsCache.set(filePath, comments);
    } catch (error) {
      console.error(`Error extracting comments from ${filePath}:`, error);
    }
    
    return comments;
  }

  /**
   * Extract JavaScript/TypeScript comments
   */
  extractJavaScriptComments(lines, comments) {
    let inBlockComment = false;
    let currentBlock = [];
    let lastCommentLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Block comment start
      if (trimmed.startsWith('/**')) {
        inBlockComment = true;
        currentBlock = [trimmed];
        lastCommentLine = i;
      }
      // Block comment content
      else if (inBlockComment) {
        currentBlock.push(trimmed);
        if (trimmed.includes('*/')) {
          inBlockComment = false;
          
          // Parse the block comment
          const commentText = currentBlock.join('\n');
          
          // Check what follows the comment
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            
            // Function comment
            if (nextLine.includes('function') || nextLine.includes('=>') || 
                nextLine.match(/^\w+\s*\(/)) {
              const funcName = this.extractFunctionName(nextLine);
              if (funcName) {
                comments.functions[funcName] = commentText;
              }
            }
            // Class comment
            else if (nextLine.includes('class')) {
              const className = this.extractClassName(nextLine);
              if (className) {
                comments.classes[className] = commentText;
              }
            }
            // File header (if at the beginning)
            else if (lastCommentLine < 5) {
              comments.fileHeader = commentText;
            }
          }
          
          currentBlock = [];
        }
      }
      // Single line comments
      else if (trimmed.startsWith('//')) {
        const commentContent = trimmed.substring(2).trim();
        
        // TODO comments
        if (commentContent.startsWith('TODO:') || commentContent.startsWith('FIXME:')) {
          comments.todos.push({
            line: i + 1,
            text: commentContent
          });
        }
        // Warning/important comments
        else if (commentContent.startsWith('WARNING:') || commentContent.startsWith('IMPORTANT:') ||
                 commentContent.startsWith('NOTE:')) {
          comments.warnings.push({
            line: i + 1,
            text: commentContent
          });
        }
        // @ts-ignore and similar
        else if (commentContent.startsWith('@ts-') || commentContent.startsWith('eslint-')) {
          comments.important.push({
            line: i + 1,
            text: commentContent,
            type: 'directive'
          });
        }
      }
    }
  }

  /**
   * Extract Python comments and docstrings
   */
  extractPythonComments(lines, comments) {
    let inDocstring = false;
    let docstringDelimiter = '';
    let currentDocstring = [];
    let docstringStartLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Docstring handling
      if (!inDocstring && (trimmed.startsWith('"""') || trimmed.startsWith("'''"))) {
        docstringDelimiter = trimmed.substring(0, 3);
        inDocstring = true;
        docstringStartLine = i;
        
        // Single line docstring
        if (trimmed.endsWith(docstringDelimiter) && trimmed.length > 6) {
          const docContent = trimmed.substring(3, trimmed.length - 3);
          this.processPythonDocstring(docContent, i, lines, comments);
          inDocstring = false;
        } else {
          currentDocstring = [trimmed.substring(3)];
        }
      } else if (inDocstring) {
        if (trimmed.endsWith(docstringDelimiter)) {
          currentDocstring.push(trimmed.substring(0, trimmed.length - 3));
          const docContent = currentDocstring.join('\n');
          this.processPythonDocstring(docContent, docstringStartLine, lines, comments);
          inDocstring = false;
          currentDocstring = [];
        } else {
          currentDocstring.push(line);
        }
      }
      // Single line comments
      else if (trimmed.startsWith('#')) {
        const commentContent = trimmed.substring(1).trim();
        
        if (commentContent.startsWith('TODO:') || commentContent.startsWith('FIXME:')) {
          comments.todos.push({
            line: i + 1,
            text: commentContent
          });
        } else if (commentContent.startsWith('WARNING:') || commentContent.startsWith('IMPORTANT:')) {
          comments.warnings.push({
            line: i + 1,
            text: commentContent
          });
        }
      }
    }
  }

  /**
   * Process Python docstring
   */
  processPythonDocstring(docContent, startLine, lines, comments) {
    // Check what the docstring is documenting
    if (startLine > 0) {
      const prevLine = lines[startLine - 1].trim();
      
      if (prevLine.startsWith('def ')) {
        const funcName = prevLine.match(/def\s+(\w+)/)?.[1];
        if (funcName) {
          comments.functions[funcName] = docContent;
        }
      } else if (prevLine.startsWith('class ')) {
        const className = prevLine.match(/class\s+(\w+)/)?.[1];
        if (className) {
          comments.classes[className] = docContent;
        }
      }
    } else {
      // Module-level docstring
      comments.fileHeader = docContent;
    }
  }

  /**
   * Extract Java-style comments
   */
  extractJavaStyleComments(lines, comments) {
    // Similar to JavaScript but with different patterns
    this.extractJavaScriptComments(lines, comments);
  }

  /**
   * Extract test descriptions
   */
  async extractTestDescriptions(testPath) {
    const tests = [];
    
    try {
      const content = fs.readFileSync(testPath, 'utf-8');
      const lines = content.split('\n');
      
      // Look for describe/it blocks (JavaScript)
      const describeRegex = /describe\s*\(\s*['"`](.+?)['"`]/;
      const itRegex = /it\s*\(\s*['"`](.+?)['"`]/;
      const testRegex = /test\s*\(\s*['"`](.+?)['"`]/;
      
      for (const line of lines) {
        let match;
        if ((match = line.match(describeRegex))) {
          tests.push({ type: 'suite', description: match[1] });
        } else if ((match = line.match(itRegex)) || (match = line.match(testRegex))) {
          tests.push({ type: 'test', description: match[1] });
        }
      }
    } catch (error) {
      console.error(`Error extracting tests from ${testPath}:`, error);
    }
    
    return tests;
  }

  /**
   * Extract type definitions
   */
  async extractTypeDefinitions(typesPath) {
    const types = {};
    
    try {
      const content = fs.readFileSync(typesPath, 'utf-8');
      // Basic extraction - could be enhanced with proper TypeScript parsing
      const interfaceRegex = /interface\s+(\w+)\s*{([^}]+)}/g;
      const typeRegex = /type\s+(\w+)\s*=\s*([^;]+);/g;
      
      let match;
      while ((match = interfaceRegex.exec(content))) {
        types[match[1]] = {
          kind: 'interface',
          definition: match[2].trim()
        };
      }
      
      while ((match = typeRegex.exec(content))) {
        types[match[1]] = {
          kind: 'type',
          definition: match[2].trim()
        };
      }
    } catch (error) {
      console.error(`Error extracting types from ${typesPath}:`, error);
    }
    
    return types;
  }

  /**
   * Fetch API documentation from online sources
   * @param {string} technology - Technology/library name
   * @param {string} query - Specific query
   * @returns {Object} API documentation
   */
  async fetchAPIDocumentation(technology, query) {
    const cacheKey = `api_${technology}_${query}`;
    
    // Check cache
    if (this.apiDocsCache.has(cacheKey)) {
      return this.apiDocsCache.get(cacheKey);
    }
    
    const docs = {
      source: null,
      content: null,
      relevant: []
    };
    
    try {
      // Check if we have a known source for this technology
      const techLower = technology.toLowerCase();
      const source = this.apiDocSources[techLower];
      
      if (source) {
        docs.source = source;
        
        // For MVP, we'll just store the URL
        // In production, you'd actually fetch and parse the documentation
        docs.content = `API documentation available at: ${source}`;
        
        // Simulate finding relevant sections
        docs.relevant = [
          `For ${technology} ${query}, refer to: ${source}`,
          `Key concepts: Components, State, Props, Hooks` // Example
        ];
      }
      
      // Try to find in node_modules if it's a package
      const packageDocsPath = path.join(
        this.projectRoot,
        'node_modules',
        technology,
        'README.md'
      );
      
      if (fs.existsSync(packageDocsPath)) {
        docs.packageDocs = fs.readFileSync(packageDocsPath, 'utf-8');
      }
      
      // Cache results
      this.apiDocsCache.set(cacheKey, docs);
    } catch (error) {
      console.error(`Error fetching API docs for ${technology}:`, error);
    }
    
    return docs;
  }

  /**
   * Find relevant documentation sections
   * @param {Object} documentation - All documentation
   * @param {string} query - Search query
   * @returns {Array} Relevant sections
   */
  findRelevantSections(documentation, query) {
    const relevant = [];
    const queryLower = (query || '').toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    // Search in local docs
    if (documentation.local) {
      Object.entries(documentation.local).forEach(([key, value]) => {
        if (typeof value === 'string') {
          const score = this.calculateRelevanceScore(value, queryWords);
          if (score > 0.3) {
            relevant.push({
              source: `local.${key}`,
              content: this.extractRelevantPortion(value, queryWords),
              score
            });
          }
        }
      });
    }
    
    // Search in code comments
    if (documentation.comments) {
      // File header is often very relevant
      if (documentation.comments.fileHeader) {
        relevant.push({
          source: 'comments.fileHeader',
          content: documentation.comments.fileHeader,
          score: 0.8
        });
      }
      
      // Function comments
      Object.entries(documentation.comments.functions || {}).forEach(([funcName, comment]) => {
        const score = this.calculateRelevanceScore(comment, queryWords);
        if (score > 0.3 || queryWords.some(word => funcName.toLowerCase().includes(word))) {
          relevant.push({
            source: `comments.function.${funcName}`,
            content: comment,
            score: Math.max(score, 0.5)
          });
        }
      });
    }
    
    // Sort by relevance score
    relevant.sort((a, b) => b.score - a.score);
    
    // Return top 5 most relevant sections
    return relevant.slice(0, 5);
  }

  /**
   * Calculate relevance score
   */
  calculateRelevanceScore(text, queryWords) {
    const textLower = text.toLowerCase();
    let score = 0;
    let matchCount = 0;
    
    for (const word of queryWords) {
      if (textLower.includes(word)) {
        matchCount++;
        // Count occurrences
        const regex = new RegExp(word, 'gi');
        const matches = textLower.match(regex);
        score += matches ? matches.length * 0.1 : 0;
      }
    }
    
    // Bonus for matching all query words
    if (matchCount === queryWords.length) {
      score += 0.5;
    }
    
    // Normalize score
    return Math.min(score / queryWords.length, 1);
  }

  /**
   * Extract relevant portion of text
   */
  extractRelevantPortion(text, queryWords, maxLength = 500) {
    // Find first occurrence of any query word
    let firstIndex = text.length;
    for (const word of queryWords) {
      const index = text.toLowerCase().indexOf(word.toLowerCase());
      if (index !== -1 && index < firstIndex) {
        firstIndex = index;
      }
    }
    
    // Extract portion around the match
    const start = Math.max(0, firstIndex - 100);
    const end = Math.min(text.length, firstIndex + maxLength);
    
    let portion = text.substring(start, end);
    
    // Add ellipsis if truncated
    if (start > 0) portion = '...' + portion;
    if (end < text.length) portion = portion + '...';
    
    return portion;
  }

  /**
   * Summarize documentation
   * @param {Array} relevantSections - Relevant documentation sections
   * @returns {string} Summary
   */
  summarizeDocumentation(relevantSections) {
    if (relevantSections.length === 0) {
      return 'No relevant documentation found for this task.';
    }
    
    const summary = [];
    summary.push('📚 Relevant Documentation Summary:\n');
    
    for (const section of relevantSections) {
      summary.push(`\n📍 Source: ${section.source}`);
      summary.push(`Relevance: ${(section.score * 100).toFixed(0)}%`);
      
      // Truncate content if too long
      const content = section.content.length > 300 
        ? section.content.substring(0, 300) + '...'
        : section.content;
      
      summary.push(content);
      summary.push('---');
    }
    
    return summary.join('\n');
  }

  /**
   * Check if a document is relevant to the task
   */
  isRelevantDoc(fileName, taskType) {
    const relevantDocs = {
      'coding': ['api', 'reference', 'guide', 'tutorial'],
      'debugging': ['troubleshooting', 'errors', 'debug', 'logs'],
      'testing': ['testing', 'test', 'spec', 'coverage'],
      'deployment': ['deployment', 'deploy', 'ci', 'cd', 'docker'],
      'setup': ['setup', 'install', 'configuration', 'getting-started']
    };
    
    const fileNameLower = fileName.toLowerCase();
    const relevant = relevantDocs[taskType] || [];
    
    return relevant.some(term => fileNameLower.includes(term));
  }

  /**
   * Get documentation priority
   */
  getDocPriority(fileName, taskType) {
    // Higher priority for task-specific docs
    if (this.isRelevantDoc(fileName, taskType)) {
      return 10;
    }
    
    // Medium priority for general docs
    if (fileName.toLowerCase().includes('readme')) {
      return 5;
    }
    
    // Low priority for everything else
    return 1;
  }

  /**
   * Extract function name from code line
   */
  extractFunctionName(line) {
    // Various function declaration patterns
    const patterns = [
      /function\s+(\w+)/,
      /const\s+(\w+)\s*=/,
      /let\s+(\w+)\s*=/,
      /var\s+(\w+)\s*=/,
      /(\w+)\s*:\s*function/,
      /(\w+)\s*\(/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Extract class name from code line
   */
  extractClassName(line) {
    const match = line.match(/class\s+(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.docsCache.clear();
    this.apiDocsCache.clear();
    this.codeCommentsCache.clear();
    console.log('Documentation cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      docsCache: this.docsCache.size,
      apiDocsCache: this.apiDocsCache.size,
      codeCommentsCache: this.codeCommentsCache.size
    };
  }
}

module.exports = { DocumentationReader };

