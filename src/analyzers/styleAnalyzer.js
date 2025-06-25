const fs = require('fs-extra');
const path = require('path');

class StyleAnalyzer {
  constructor() {
    this.analysisData = null;
    this.stylePatterns = {};
    this.templates = {};
  }

  // 분석 데이터 읽기
  async loadAnalysisData() {
    try {
      console.log('브런치 분석 데이터 로딩 중...');
      
      const analysisDir = path.join(__dirname, '../../data/analysis');
      
      // 최신 분석 파일 찾기
      let dataFile = path.join(analysisDir, 'brunch-style-latest.json');
      
      if (!await fs.pathExists(dataFile)) {
        // brunch-style.json 찾기
        dataFile = path.join(analysisDir, 'brunch-style.json');
        
        if (!await fs.pathExists(dataFile)) {
          // 디렉토리에서 가장 최근 파일 찾기
          const files = await fs.readdir(analysisDir);
          const brunchFiles = files.filter(file => file.startsWith('brunch-style-') && file.endsWith('.json'))
            .sort()
            .reverse();
          
          if (brunchFiles.length === 0) {
            throw new Error('분석 데이터 파일을 찾을 수 없습니다.');
          }
          
          dataFile = path.join(analysisDir, brunchFiles[0]);
        }
      }
      
      console.log(`데이터 파일 로딩: ${dataFile}`);
      this.analysisData = await fs.readJson(dataFile);
      
      if (!this.analysisData.analysis) {
        throw new Error('유효하지 않은 분석 데이터 형식입니다.');
      }
      
      console.log('데이터 로딩 완료');
      return this.analysisData;
      
    } catch (error) {
      console.error('데이터 로딩 실패:', error.message);
      throw error;
    }
  }

  // 제목 형식 패턴 추출
  extractTitlePatterns() {
    console.log('제목 패턴 추출 중...');
    
    const titleData = this.analysisData.analysis.titlePatterns;
    
    if (!titleData) {
      return { error: '제목 패턴 데이터가 없습니다.' };
    }
    
    const patterns = {
      // 길이 패턴
      length: {
        optimal: Math.round(titleData.averageLength || 0),
        range: titleData.lengthDistribution || {},
        recommendation: this.getTitleLengthRecommendation(titleData.averageLength)
      },
      
      // 스타일 패턴
      style: {
        questionRate: this.calculatePercentage(titleData.questionTitles, titleData.totalCount),
        exclamationRate: this.calculatePercentage(titleData.exclamationTitles, titleData.totalCount),
        numberedRate: this.calculatePercentage(titleData.numberedTitles, titleData.totalCount),
        preferredStyle: this.identifyPreferredTitleStyle(titleData)
      },
      
      // 시작 패턴
      startingWords: titleData.startingWords || {},
      frequentWords: titleData.frequentWords || {},
      
      // 구두점 사용
      punctuation: titleData.punctuationUsage || {},
      
      // 제목 템플릿
      templates: this.generateTitleTemplates(titleData)
    };
    
    this.stylePatterns.titlePatterns = patterns;
    return patterns;
  }

  // 글 구조 패턴 추출
  extractStructurePatterns() {
    console.log('글 구조 패턴 추출 중...');
    
    const paragraphData = this.analysisData.analysis.paragraphStructure;
    const lengthData = this.analysisData.analysis.articleLength;
    
    if (!paragraphData && !lengthData) {
      return { error: '구조 패턴 데이터가 없습니다.' };
    }
    
    const patterns = {
      // 문단 구성
      paragraphs: paragraphData ? {
        average: Math.round(paragraphData.averageParagraphs || 0),
        distribution: paragraphData.paragraphDistribution || {},
        sentencesPerParagraph: Math.round(paragraphData.averageSentencesPerParagraph || 0),
        structureTypes: paragraphData.structureTypes || {},
        recommendation: this.getStructureRecommendation(paragraphData)
      } : null,
      
      // 글 길이
      length: lengthData ? {
        characters: {
          average: Math.round(lengthData.characterLength?.average || 0),
          optimal: lengthData.optimalRange || {},
          categories: lengthData.lengthCategories || {}
        },
        words: {
          average: Math.round(lengthData.wordCount?.average || 0),
          distribution: lengthData.wordCount?.distribution || {}
        },
        recommendation: this.getLengthRecommendation(lengthData)
      } : null,
      
      // 구조 템플릿
      templates: this.generateStructureTemplates(paragraphData, lengthData)
    };
    
    this.stylePatterns.structurePatterns = patterns;
    return patterns;
  }

  // 문체 패턴 추출
  extractWritingStylePatterns() {
    console.log('문체 패턴 추출 중...');
    
    const introData = this.analysisData.analysis.introductionStyle;
    const conclusionData = this.analysisData.analysis.conclusionPatterns;
    const expressionData = this.analysisData.analysis.frequentExpressions;
    
    const patterns = {
      // 도입부 스타일
      introduction: introData ? {
        averageLength: Math.round(introData.averageLength || 0),
        questionStartRate: this.calculatePercentage(introData.questionStart, introData.totalCount),
        exclamationStartRate: this.calculatePercentage(introData.exclamationStart, introData.totalCount),
        commonPhrases: introData.commonStartPhrases || {},
        sentenceStructure: introData.sentenceStructure || {},
        templates: this.generateIntroTemplates(introData)
      } : null,
      
      // 결론부 스타일
      conclusion: conclusionData ? {
        averageLength: Math.round(conclusionData.averageLength || 0),
        questionEndRate: this.calculatePercentage(conclusionData.questionEnding, conclusionData.totalCount),
        exclamationEndRate: this.calculatePercentage(conclusionData.exclamationEnding, conclusionData.totalCount),
        commonPhrases: conclusionData.commonConclusionPhrases || {},
        emotionalExpressions: conclusionData.emotionalEndings || {},
        templates: this.generateConclusionTemplates(conclusionData)
      } : null,
      
      // 표현 스타일
      expressions: expressionData ? {
        frequentWords: expressionData.frequentWords || {},
        transitionWords: expressionData.transitionWords || {},
        emotionalWords: expressionData.emotionalExpressions || {},
        emphasisWords: expressionData.emphasisWords || {},
        tone: this.analyzeTone(expressionData)
      } : null,
      
      // 문체 특성
      characteristics: this.analyzeWritingCharacteristics()
    };
    
    this.stylePatterns.writingStylePatterns = patterns;
    return patterns;
  }

  // 핵심 키워드 TOP 10 추출
  extractKeywords() {
    console.log('핵심 키워드 추출 중...');
    
    const expressionData = this.analysisData.analysis.frequentExpressions;
    const titleData = this.analysisData.analysis.titlePatterns;
    const hashtagData = this.analysisData.analysis.hashtagPatterns;
    
    const keywords = {
      // 전체 키워드
      overall: this.mergeAndRankKeywords([
        expressionData?.frequentWords || {},
        titleData?.frequentWords || {},
        hashtagData?.mostFrequent || {}
      ]),
      
      // 카테고리별 키워드
      byCategory: {
        title: this.getTopKeywords(titleData?.frequentWords || {}, 5),
        content: this.getTopKeywords(expressionData?.frequentWords || {}, 10),
        hashtag: this.getTopKeywords(hashtagData?.mostFrequent || {}, 5),
        emotion: this.getTopKeywords(expressionData?.emotionalWords || {}, 5),
        emphasis: this.getTopKeywords(expressionData?.emphasisWords || {}, 5)
      },
      
      // 해시태그 카테고리
      hashtagCategories: hashtagData?.categories || {},
      
      // 키워드 활용 템플릿
      templates: this.generateKeywordTemplates()
    };
    
    this.stylePatterns.keywords = keywords;
    return keywords;
  }

  // 템플릿 생성
  generateTemplates() {
    console.log('템플릿 생성 중...');
    
    const templates = {
      // 제목 템플릿
      title: this.stylePatterns.titlePatterns?.templates || [],
      
      // 도입부 템플릿
      introduction: this.stylePatterns.writingStylePatterns?.introduction?.templates || [],
      
      // 본문 구조 템플릿
      structure: this.stylePatterns.structurePatterns?.templates || [],
      
      // 결론부 템플릿
      conclusion: this.stylePatterns.writingStylePatterns?.conclusion?.templates || [],
      
      // 전체 글 템플릿
      article: this.generateArticleTemplate(),
      
      // 키워드 활용 가이드
      keywords: this.stylePatterns.keywords?.templates || {}
    };
    
    this.templates = templates;
    return templates;
  }

  // 전체 스타일 분석 실행
  async performStyleAnalysis() {
    try {
      console.log('=== 스타일 패턴 분석 시작 ===');
      
      // 1. 데이터 로딩
      await this.loadAnalysisData();
      
      // 2. 패턴 추출
      this.extractTitlePatterns();
      this.extractStructurePatterns();
      this.extractWritingStylePatterns();
      this.extractKeywords();
      
      // 3. 템플릿 생성
      this.generateTemplates();
      
      // 4. 결과 저장
      await this.saveStyleTemplate();
      
      // 5. 요약 출력
      this.printStyleSummary();
      
      return {
        patterns: this.stylePatterns,
        templates: this.templates
      };
      
    } catch (error) {
      console.error('스타일 분석 실패:', error);
      throw error;
    }
  }

  // 스타일 템플릿 저장
  async saveStyleTemplate() {
    try {
      const analysisDir = path.join(__dirname, '../../data/analysis');
      await fs.ensureDir(analysisDir);
      
      const styleTemplate = {
        metadata: {
          createdAt: new Date().toISOString(),
          basedOn: this.analysisData.metadata,
          version: '1.0.0'
        },
        patterns: this.stylePatterns,
        templates: this.templates,
        summary: this.generatePatternSummary()
      };
      
      const filepath = path.join(analysisDir, 'style-template.json');
      await fs.writeJson(filepath, styleTemplate, { spaces: 2 });
      
      console.log(`스타일 템플릿 저장됨: ${filepath}`);
      
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
    }
  }

  // 스타일 요약 출력
  printStyleSummary() {
    console.log('\n=== 브런치 스타일 패턴 분석 결과 ===');
    
    // 제목 패턴
    if (this.stylePatterns.titlePatterns) {
      const tp = this.stylePatterns.titlePatterns;
      console.log(`\n📝 제목 패턴:`);
      console.log(`   - 최적 길이: ${tp.length.optimal}자`);
      console.log(`   - 선호 스타일: ${tp.style.preferredStyle}`);
      console.log(`   - 자주 사용하는 시작 단어: ${Object.keys(tp.startingWords).slice(0, 3).join(', ')}`);
    }
    
    // 구조 패턴
    if (this.stylePatterns.structurePatterns) {
      const sp = this.stylePatterns.structurePatterns;
      console.log(`\n📄 글 구조:`);
      if (sp.paragraphs) {
        console.log(`   - 평균 문단 수: ${sp.paragraphs.average}개`);
        console.log(`   - 문단당 문장 수: ${sp.paragraphs.sentencesPerParagraph}개`);
      }
      if (sp.length) {
        console.log(`   - 평균 글자 수: ${sp.length.characters.average}자`);
      }
    }
    
    // 문체 특성
    if (this.stylePatterns.writingStylePatterns) {
      const wp = this.stylePatterns.writingStylePatterns;
      console.log(`\n✍️ 문체 특성:`);
      if (wp.characteristics) {
        console.log(`   - 문체: ${wp.characteristics.tone || '분석 불가'}`);
        console.log(`   - 감정 표현: ${wp.characteristics.emotionalLevel || '중간'} 수준`);
      }
    }
    
    // 핵심 키워드
    if (this.stylePatterns.keywords) {
      const kw = this.stylePatterns.keywords;
      console.log(`\n🔑 핵심 키워드 TOP 5:`);
      Object.entries(kw.overall).slice(0, 5).forEach(([word, count], index) => {
        console.log(`   ${index + 1}. ${word} (${count}회)`);
      });
    }
    
    console.log('\n=== 스타일 분석 완료 ===\n');
  }

  // 유틸리티 메서드들
  calculatePercentage(count, total) {
    if (!total || total === 0) return 0;
    return Math.round((count / total) * 100);
  }

  getTitleLengthRecommendation(averageLength) {
    if (averageLength < 10) return '너무 짧음 - 10자 이상 권장';
    if (averageLength < 20) return '적정 길이';
    if (averageLength < 30) return '조금 긴 편 - 간결성 고려';
    return '너무 긴 편 - 20자 내외 권장';
  }

  identifyPreferredTitleStyle(titleData) {
    const styles = [];
    
    if (titleData.questionTitles > 0) styles.push('질문형');
    if (titleData.exclamationTitles > 0) styles.push('감탄형');
    if (titleData.numberedTitles > 0) styles.push('숫자 포함');
    
    const punctuation = titleData.punctuationUsage || {};
    if (punctuation.colons > 0) styles.push('설명형');
    
    return styles.length > 0 ? styles.join(', ') : '평서형';
  }

  generateTitleTemplates(titleData) {
    const templates = [];
    
    // 자주 사용하는 시작 단어 기반 템플릿
    const startWords = Object.keys(titleData.startingWords || {}).slice(0, 3);
    startWords.forEach(word => {
      templates.push(`${word} [주제]에 대한 이야기`);
    });
    
    // 스타일 기반 템플릿
    if (titleData.questionTitles > 0) {
      templates.push('[주제]에 대해 알고 계신가요?');
    }
    
    if (titleData.exclamationTitles > 0) {
      templates.push('[주제]의 놀라운 사실!');
    }
    
    if (titleData.numberedTitles > 0) {
      templates.push('[주제]를 위한 N가지 방법');
    }
    
    return templates;
  }

  getStructureRecommendation(paragraphData) {
    const avg = paragraphData.averageParagraphs || 0;
    
    if (avg < 3) return '문단 수 부족 - 3-7개 권장';
    if (avg <= 7) return '적정 문단 구성';
    return '문단이 많음 - 가독성 고려';
  }

  getLengthRecommendation(lengthData) {
    const avgChars = lengthData.characterLength?.average || 0;
    
    if (avgChars < 500) return '짧은 글 - 내용 보강 필요';
    if (avgChars < 1500) return '적정 길이';
    if (avgChars < 3000) return '긴 글 - 구조 정리 권장';
    return '매우 긴 글 - 분할 고려';
  }

  generateStructureTemplates(paragraphData, lengthData) {
    const templates = [];
    
    if (paragraphData) {
      const avgParagraphs = Math.round(paragraphData.averageParagraphs || 5);
      
      templates.push({
        name: '기본 구조',
        structure: [
          '도입부 (문제 제기)',
          ...Array(avgParagraphs - 2).fill('본문 (내용 전개)'),
          '결론부 (정리 및 마무리)'
        ]
      });
    }
    
    return templates;
  }

  generateIntroTemplates(introData) {
    const templates = [];
    
    const commonPhrases = Object.keys(introData.commonStartPhrases || {});
    
    commonPhrases.forEach(phrase => {
      templates.push(`${phrase} [상황 설명]으로 시작하는 도입부`);
    });
    
    if (introData.questionStart > 0) {
      templates.push('질문으로 시작하여 독자의 관심 유도');
    }
    
    return templates;
  }

  generateConclusionTemplates(conclusionData) {
    const templates = [];
    
    const conclusionPhrases = Object.keys(conclusionData.commonConclusionPhrases || {});
    
    conclusionPhrases.forEach(phrase => {
      templates.push(`${phrase} [핵심 메시지]로 마무리`);
    });
    
    return templates;
  }

  analyzeTone(expressionData) {
    const emotional = Object.keys(expressionData.emotionalExpressions || {}).length;
    const emphasis = Object.keys(expressionData.emphasisWords || {}).length;
    
    if (emotional > emphasis) return '감정적이고 따뜻한 톤';
    if (emphasis > emotional) return '강조가 많은 적극적 톤';
    return '균형잡힌 중성적 톤';
  }

  analyzeWritingCharacteristics() {
    const characteristics = {
      tone: '분석 중',
      emotionalLevel: '중간',
      formalityLevel: '보통',
      personalityStyle: '친근함'
    };
    
    // 더 정교한 분석 로직은 추후 추가 가능
    return characteristics;
  }

  mergeAndRankKeywords(keywordObjects) {
    const merged = {};
    
    keywordObjects.forEach(obj => {
      Object.entries(obj).forEach(([word, count]) => {
        merged[word] = (merged[word] || 0) + count;
      });
    });
    
    return Object.entries(merged)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [word, count]) => ({ ...obj, [word]: count }), {});
  }

  getTopKeywords(keywordObj, limit) {
    return Object.entries(keywordObj)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .reduce((obj, [word, count]) => ({ ...obj, [word]: count }), {});
  }

  generateKeywordTemplates() {
    return {
      usage: '핵심 키워드를 제목과 본문에 자연스럽게 배치',
      density: '글 전체 길이의 1-2% 수준으로 키워드 사용',
      placement: '제목, 첫 문단, 마지막 문단에 우선 배치'
    };
  }

  generateArticleTemplate() {
    return {
      structure: [
        '1. 제목: [핵심 키워드] + [호기심 유발 요소]',
        '2. 도입부: 문제 제기 또는 상황 설명 (1-2문단)',
        '3. 본문: 내용 전개 (3-5문단)',
        '   - 각 문단: 소주제별 구성',
        '   - 연결어를 활용한 자연스러운 흐름',
        '4. 결론부: 핵심 메시지 정리 및 마무리 (1문단)',
        '5. 해시태그: 카테고리별 2-4개'
      ],
      tips: [
        '문단 간 자연스러운 연결 유지',
        '감정 표현과 강조 표현의 균형',
        '독자와의 소통을 의식한 문체 사용'
      ]
    };
  }

  generatePatternSummary() {
    return {
      titleStyle: this.stylePatterns.titlePatterns?.style?.preferredStyle || '평서형',
      averageLength: this.stylePatterns.structurePatterns?.length?.characters?.average || 0,
      averageParagraphs: this.stylePatterns.structurePatterns?.paragraphs?.average || 0,
      topKeywords: Object.keys(this.stylePatterns.keywords?.overall || {}).slice(0, 5),
      writingTone: this.stylePatterns.writingStylePatterns?.characteristics?.tone || '중성적'
    };
  }
}

module.exports = StyleAnalyzer;

// 직접 실행 시 테스트
if (require.main === module) {
  const analyzer = new StyleAnalyzer();
  
  analyzer.performStyleAnalysis()
    .then(results => {
      console.log('스타일 분석 완료!');
    })
    .catch(error => {
      console.error('스타일 분석 실패:', error.message);
    });
}