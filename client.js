window.__ModuleLoader__.load({
  id: '@local/literature-reader',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } = React

    const NS = 'literature-reader'
    const API = '/literature-reader/api'
    const LAST_KEY = 'dsh.literature.lastPaper.v1'
    const EMPTY = []
    const ZOOM_MIN = 40
    const ZOOM_MAX = 300
    const ZOOM_STEP = 15
    const ZOOM_DEFAULT = 100

    const zh = {
      panel: '文献阅读室',
      library: '文献库',
      libraryTitle: '文献库',
      backToReader: '返回阅读',
      allItems: '全部文献',
      pdfTab: '文献 PDF',
      notesTab: '阅读笔记',
      includeChildren: '包含子文件夹',
      searchLibrary: '搜索标题、文件名、标签…',
      refresh: '刷新',
      newFolder: '新建文件夹',
      importHere: '导入到当前文件夹',
      foldersCount: '个文件夹',
      pdfsCount: '篇 PDF',
      notesCount: '篇笔记',
      read: '阅读',
      continueReading: '继续阅读',
      editItem: '编辑',
      editItemTitle: '编辑文献',
      titleLabel: '文献标题',
      fileNameLabel: 'PDF 文件名',
      tagsLabel: '标签（逗号分隔）',
      save: '保存',
      saving: '保存中…',
      renameWarning: '修改文件名会重命名实际 PDF，并自动修正 vault 内可识别的 [[链接]]。你也可以勾选下方选项，让关联笔记一起改名。保存前请确认 Obsidian 中没有未保存的修改。',
      renameNoteToggle: '同时重命名关联笔记',
      renameNoteTarget: '笔记将改名为：{name}',
      keepNoteName: '保留原笔记文件名，只同步更新链接与属性。',
      associatedNote: '关联笔记',
      noAssociatedNote: '暂无关联笔记，保存标签时会创建同名笔记',
      detachedTitle: '插件缓存（不在 Obsidian）',
      emptyFolderPdfs: '这个文件夹里还没有 PDF',
      emptyFolderNotes: '这个文件夹里还没有 Markdown 笔记',
      createFolderTitle: '新建文件夹',
      folderName: '文件夹名',
      create: '创建',
      libraryLoading: '正在扫描 Obsidian 库…',
      noSearchResults: '没有匹配的文献',
      statusUnread: '未阅读',
      statusProcessing: '处理中',
      statusReady: '已通读',
      statusError: '需要处理',
      openNote: '打开笔记',
      editVaultItem: '编辑名称与标签',
      saved: '已保存',
      vaultRoot: '库根目录',
      legacyOpen: '打开',
      syncHint: '文献库与 Obsidian 文件夹实时同构；从 Obsidian 新增的 PDF 会自动出现。',
      summary: '生成总结',
      regenerateSummary: '重新生成总结',
      preview: '预览',
      close: '关闭',
      cancel: '取消',
      send: '发送',
      stop: '停止',
      retry: '重试',
      delete: '删除',
      confirmDelete: '确定要删除这篇文献及其页面、批注和问答记录吗？',
      deleteFolder: '删除文件夹',
      deletePdf: '删除文献',
      deleteNote: '删除笔记',
      deleteCache: '删除缓存',
      renameFolder: '重命名文件夹',
      rename: '重命名',
      renameFolderHint: '只修改文件夹名称，里面的文件会一起移动，Obsidian 中的路径链接会自动更新。',
      relatedNotes: '关联笔记',
      relatedNotesHint: '这些笔记引用了这篇文献。默认保留；勾选后会一起删除。',
      noRelatedNotes: '没有关联笔记',
      deleteNotesToggle: '同时删除这些关联笔记',
      confirmDeleteFolder: '确定要删除文件夹「{name}」吗？其中的 {pdfs} 篇文献和 {notes} 篇笔记也会一起删除。',
      confirmDeleteNote: '确定要从 Obsidian 中删除这篇笔记吗？',
      confirmDeletePdf: '确定要从 Obsidian 中删除这篇文献吗？',
      deleteCacheOnly: '只会删除插件的阅读缓存，不会改动 Obsidian 文件。',
      deletePdfWarning: 'PDF 原件会移入插件备份；这篇文献的页面缓存、批注、问答和总结副本也会一并清理。',
      deleteNoteWarning: '笔记文件会移入插件备份，文献库中不再显示。',
      deleteFolderWarning: '文件夹及其中的所有内容会移入插件备份，文献库中不再显示。',
      deleteBackupHint: '删除的内容会先移入插件备份目录 {path}，可在文件管理器中找回。',
      deleting: '正在删除…',
      dragHint: '拖动卡片到左侧文件夹可移动',
      dropHere: '松开即可移动到「{name}」',
      movedOk: '已移动到「{folder}」',
      folderRenamedOk: '文件夹已重命名',
      folderRenamedSanitized: '文件夹名含特殊字符，已保存为「{name}」',
      folderRenameUnchanged: '文件夹名没有变化',
      busyMoveBlocked: '当前有文献正在处理，请完成后再移动',
      deletedOk: '已删除',
      emptyTitle: '把论文读成自己的知识',
      emptyDesc: '导入一篇 PDF，AI 会先通读全文。你可以框选任意段落提问、用画笔做批注，读完后一键生成带标签的 Obsidian 学习总结。',
      emptyImport: '导入第一篇文献',
      featureRead: '自动通读',
      featureReadDesc: '导入后先在后台理解全文、公式与结论。',
      featureAsk: '框选提问',
      featureAskDesc: '拖一个框，截图 + 上下文一起交给 AI。',
      featureNote: 'Obsidian 总结',
      featureNoteDesc: '把问题、收获和标签整理成 Markdown。',
      aiReader: 'AI 阅读助手',
      processing: '处理中',
      ready: '已通读',
      failed: '需要处理',
      pagesUnit: '页',
      reading: 'AI 正在通读',
      noText: '正文识别未完成',
      resizeHint: '拖动调整阅读区与 AI 对话的宽度（双击恢复 74%）',
      selectTool: '框选',
      penTool: '画笔',
      eraserTool: '橡皮',
      panTool: '拖动',
      fullscreen: '全屏',
      exitFullscreen: '退出全屏',
      fullscreenFailed: '当前环境无法进入全屏',
      width: '粗细',
      eraserSize: '橡皮大小',
      undo: '撤销',
      chapter: '章节',
      extract: '提炼',
      customRange: '自定义范围',
      startPage: '起始页',
      endPage: '结束页',
      selectChapter: '选择章节',
      outlineLoading: '识别章节中…',
      translate: '翻译',
      term: '名词解释',
      explain: '解释',
      points: '提炼要点',
      critique: '质疑',
      quickAsk: '快捷提问',
      selectionExists: '已框选',
      selectionAsk: '提问',
      questionPlaceholder: '针对这篇文献提问，或框选一段内容…',
      chatDisabled: 'AI 正在解析这篇文献，稍后即可提问',
      pageContext: '第 {page} 页',
      selectionContext: '第 {page} 页 · 已框选',
      clearSelection: '取消框选',
      analysisTitle: 'AI 的阅读理解',
      analysisOpen: '查看',
      analysisMissing: '还没有生成阅读备忘',
      readingDigest: '阅读摘要',
      summaryReady: '总结已就绪',
      readingHint: 'AI 正在阅读全文，完成后即可提问、翻译或生成总结。',
      starter1: '用三句话概括这篇文献',
      starter2: '解释 Figure 1 的物理含义',
      starter3: '这篇工作最重要的局限是什么？',
      vaultKicker: 'OBSIDIAN VAULT',
      summaryRunning: '正在生成总结…',
      summaryPreparing: '正在检查需要解释的术语…',
      glossaryTitle: '这些词要收进「名词解释」吗？',
      glossaryIntro: 'AI 判断不了它们是不是这篇文献的专业术语，请你确认。',
      glossarySelectAll: '全选',
      glossarySelectNone: '全不选',
      glossaryStart: '开始生成',
      glossaryCancel: '取消',
      glossaryIncluded: '另有 {count} 条已确定收录',
      summaryDone: '总结已生成',
      summaryFailed: '总结生成失败',
      summaryPreview: '总结',
      openObsidian: '在 Obsidian 中打开',
      writingObsidian: '正在写入 Obsidian…',
      imported: '已导入，正在后台解析',
      upload: '正在上传',
      uploadDone: '上传完成',
      processingImport: 'AI 正在解析并通读，进度会实时显示',
      noPapers: '还没有文献',
      searchPlaceholder: '搜索标题、作者或标签…',
      open: '打开',
      model: '模型',
      analysisWarning: 'AI 通读未完成',
      retryRead: '重新通读',
      pageOf: '页',
      summaryExists: '这篇文献已经有总结，重新生成会覆盖同一个文件。继续吗？',
      annotateSaved: '批注已保存',
      summaryWritten: '已写入 Obsidian',
      wordSaved: '已记录到「{note}」第 {number} 条',
      wordDuplicateTitle: '这个单词或短语已经记录过了',
      wordDuplicateSubtitle: '没有重复写入',
      wordDuplicateBody: '「{term}」已存在于「{note}」第 {number} 条：{translation}。',
      wordDuplicateSection: '收录在「{section}」这一节。',
      wordDuplicateHint: '如果这是另一个语境下的用法，可以先在 Obsidian 中确认，再手动补充。',
      wordRecordError: '记录到 Obsidian 失败：{message}',
      notePath: '总结文件',
      copied: '已复制',
      readAnalysis: '阅读备忘',
      emptyChat: '读到哪里，问到哪里。',
      emptyChatDesc: '可以只问一个概念，也可以框选整段让 AI 翻译或解释。',
      startReading: '开始阅读',
      libraryHint: '选择一篇文献继续',
      collapse: '收起',
      expand: '展开',
      zoomOut: '缩小',
      zoomIn: '放大',
      zoomReset: '重置为 100%',
      zoomHint: 'Ctrl/⌘ + 滚轮缩放，以鼠标位置为中心；点击数字重置为 100%',
      more: '更多',
      citationJump: '跳到第 {page} 页',
      noSelection: '先在 PDF 页面上框选一段内容',
      stopGeneration: '停止生成',
      importedFile: '已选择',
      loadFailed: '加载失败',
      hostUnavailable: '文献阅读服务未启动，请确认插件已启用。',
      summaryNeedsText: '这篇文献没有可用正文，暂时无法生成总结',
      modelPicker: '模型与思考强度',
      modelPickerTitle: '选择模型',
      modelPickerSubtitle: '这里的设置只影响文献阅读室，不会改动 DSH 的默认模型。',
      modelService: '模型服务',
      modelSection: '模型',
      effortSection: '思考强度',
      effortAuto: '跟随模型',
      effortAutoDesc: '使用该模型自己的默认强度',
      effortUnsupported: '这个模型没有可调的思考强度',
      effortActive: '当前：{effort}',
      effortSwitching: '正在切换…',
      modelSaved: '已切换到 {model}',
      modelSaveFailed: '切换失败：{message}',
      noModels: '没有可用的模型',
      noModelsHint: '请先在 DSH 设置里配置模型服务，再来这里选择。',
      modelNoImage: '不支持图片',
      modelNoImageHint: '这个模型无法用于扫描版 OCR 与框选截图答疑。',
      modelImagesOk: '支持截图答疑',
      modelLoading: '正在读取模型列表…',
      modelEffortNow: '思考强度：{effort}',
      modelEffortAuto: '思考强度：跟随模型',
      modelCurrent: '当前模型',
      fontSize: '字号',
      fontSizeTitle: '阅读字号',
      fontSizeHint: '只调整右侧阅读区和输入框的字号。',
      fontSizeSmaller: '减小字号',
      fontSizeLarger: '增大字号',
      fontSizeReset: '恢复默认',
      fontSizeNow: '{size}%',
      fontSizeSmall: '小',
      fontSizeNormal: '标准',
      fontSizeLarge: '大',
      fontSizeHuge: '特大',
      modelNeedsRestart: '模型选择需要重启 DSH 宿主后才会生效。已刷新页面但宿主仍在运行旧版本。',
      noteLoading: '正在加载总结…',
      noteLoadFailed: '总结加载失败',
      noteBack: '返回阅读',
      noteOpen: '速览总结',
      import: '导入 PDF',
      chevronLeft: '上一页',
      chevronRight: '下一页',
      noteMore: '更多',
      noteKind: '速览总结 · 快速回顾',
      noteWordCount: '{count} 字',
      notePreviewTab: '预览',
      noteEditorTab: '编辑',
      noteSaving: '保存中…',
      noteSaved: '已保存',
      noteUnsaved: '未保存',
      noteSaveFailedShort: '保存失败',
      noteSaveFailed: '保存失败，请稍后重试',
      noteReloaded: '已重新载入最新正文',
      noteLeaveBody: '还有未保存的修改，确定离开总结吗？',
      noteLeaveEditBody: '还有未保存的修改，确定退出编辑吗？',
      noteConflictBody: '正文已被修改（可能是 Obsidian 里保存过）。选择覆盖保存，或重新载入最新内容。',
      noteConflictOverwrite: '覆盖保存',
      noteConflictReload: '重新载入',
      noteGenerate: '生成速览总结',
      noteEmptyBody: '这篇文献还没有总结',
      noteEmptyHint: '总结用于快速回顾，生成后可以选中任意一段写下标注，再让 AI 按标注修订。',
      noteVaultBanner: '这个笔记在 Obsidian 里被修改过（{time}），当前显示的是插件里的版本。继续保存会覆盖 Obsidian 的修改。',
      noteVaultView: '查看 Obsidian 版本',
      noteVaultTitle: 'Obsidian 里的版本',
      noteVaultReadOnly: '只读预览。本插件的历史版本只包含本地正文，不含 Obsidian 侧的手写内容——如需保留请先复制。',
      noteVaultCopy: '复制全文',
      noteVaultCopied: '已复制到剪贴板',
      noteVaultCopyFailed: '复制失败，请手动选择文本',
      noteVaultLoadFailed: '读取 Obsidian 版本失败',
      noteVaultMissing: 'Obsidian 里找不到这份笔记，可能已在外部删除',
      noteVaultOverwritten: '已保存。你之前在 Obsidian 的修改已被覆盖——本插件的历史版本只包含本地内容，不包含 Obsidian 侧的手写部分。',
      noteEditorHint: 'Ctrl/Cmd + S 保存',
      noteEditorWords: '{count} 字',
      noteEditorCancel: '退出编辑',
      noteEditorDraft: '检测到未提交的草稿',
      noteEditorDraftRestore: '恢复草稿',
      noteEditorDraftDiscard: '丢弃',
      noteAnnotate: '标注',
      noteAnnColor: '颜色',
      noteAnnPlaceholder: '写下你的意见：哪里不清楚、哪里要补充、哪里要改…',
      noteAnnNeedNote: '请先写一句意见，再保存标注',
      noteAnnSave: '保存标注',
      noteAnnSaved: '标注已保存',
      noteAnnEdit: '编辑标注',
      noteAnnDelete: '删除',
      noteAnnDeleted: '标注已删除',
      noteAnnDeleteConfirm: '确定删除这条标注吗？',
      noteAnnSaveFailed: '标注保存失败',
      noteAnnFailedLocate: '这段文字已无法定位，请重新选择',
      noteAnnSelectFirst: '请先在正文中选择一段文字',
      noteAnnShortcut: 'Ctrl/Cmd + Enter 保存，Esc 取消',
      noteAnnCount: '标注',
      noteAnnOpen: '待应用',
      noteAnnResolved: '已应用',
      noteAnnOrphan: '已失效',
      noteAnnEmpty: '还没有标注',
      noteAnnEmptyHint: '选中一句话，写下你的标注。',
      noteAnnLocate: '定位',
      noteAnnReply: 'AI 说明',
      noteAnnPanelToggle: '标注栏',
      noteAnnExpandAll: '展开全部',
      noteAnnCollapseAll: '收起全部',
      noteAnnLost: '有 {count} 条标注因正文变化而失效',
      noteColorAmber: '琥珀',
      noteColorRose: '玫红',
      noteColorSky: '天蓝',
      noteColorMint: '薄荷',
      noteStatusOpen: '待应用',
      noteStatusResolved: '已应用',
      noteStatusOrphan: '已失效',
      noteCalloutAbstract: '摘要',
      noteCalloutFigure: '图',
      noteCalloutWarning: '注意',
      noteCalloutQuestion: '问题',
      noteCalloutTip: '提示',
      noteCalloutInfo: '说明',
      noteApply: '应用修改',
      noteApplyPending: '{count} 条标注待应用',
      noteApplyHint: '不会自动修改，确认后再点应用',
      noteApplyInstruction: '补充要求（可选），例如：第 5 节讲得更细一点',
      noteApplying: '正在按你的标注修改…',
      noteApplyingFigure: '正在补图 {index}/{total}…',
      noteApplyDone: '已应用 {count} 条标注',
      noteApplyUnresolved: '已应用 {applied} 条，{unresolved} 条 AI 未能应用',
      noteApplyFailed: '修订失败，请稍后重试',
      noteInsertImage: '插图',
      noteInsertTitle: '插入图片',
      noteInsertUpload: '上传图片',
      noteInsertCrop: '从 PDF 截取',
      noteInsertPickFile: '选择图片（PNG / JPEG）',
      noteInsertPreview: '预览',
      noteInsertPage: '第 {page} / {total} 页',
      noteInsertPrevPage: '上一页',
      noteInsertNextPage: '下一页',
      noteInsertDragHint: '在页面上拖动框选要插入的区域',
      noteInsertLoadingPage: '正在加载页面…',
      noteInsertNoRegion: '请先在页面上框选区域',
      noteInsertPosition: '插入位置',
      noteInsertPosAuto: '让 AI 判断',
      noteInsertPosSection: '指定章节',
      noteInsertPosCursor: '当前光标处',
      noteInsertCursorHint: '插入到编辑区光标处；没定位到光标时放在正文末尾。',
      noteInsertInstruction: '告诉我放哪里；不确定的话我会问你',
      noteInsertSubmit: '插入',
      noteInserting: '插入中…',
      noteInsertFailed: '插图失败，请稍后重试',
      noteInsertTypeBad: '只支持 PNG 或 JPEG 图片',
      noteInsertTooLarge: '图片不能超过 8 MB',
      noteInserted: '图片已插入正文',
      noteQuestionTitle: '这张图放在哪里更合适？',
      noteQuestionRound: '第 {round} 轮',
      noteQuestionAnswerPlaceholder: '回答上面的问题，AI 会据此决定插入位置…',
      noteQuestionSubmit: '回答并插入',
      noteQuestionForce: '让 AI 直接决定',
      noteQuestionFailed: '处理回答失败，请稍后重试',
      noteFixFigures: '补全插图',
      noteFiguresRunning: '正在按占位符补图…',
      noteFiguresProgress: '补图中 {index}/{total}',
      noteFiguresDone: '已插入 {created} 张图片，{failed} 张失败',
      noteFiguresFailed: '补图失败，请稍后重试',
      noteNoPlaceholders: '当前总结没有待插入的图片',
      noteHistory: '历史',
      noteHistoryTitle: '历史版本',
      noteHistoryLoading: '正在加载历史…',
      noteHistoryEmpty: '还没有历史版本',
      noteHistoryFailed: '历史版本加载失败',
      noteHistoryChars: '{count} 字',
      noteHistoryPreview: '预览',
      noteHistoryPreviewTitle: '历史版本预览',
      noteHistoryPreviewReadOnly: '只读预览，恢复后才会替换正文',
      noteHistoryRestore: '恢复',
      noteHistoryRestoreConfirm: '恢复这个版本会覆盖当前正文（当前正文会先存为历史），确定吗？',
      noteHistorySourceAuto: '自动生成',
      noteHistorySourceManual: '手动保存',
      noteHistorySourceRevision: '按标注修订',
      noteHistorySourceRestore: '恢复',
      noteHistorySourceUnknown: '其他',
      noteRestoreDone: '已恢复历史版本',
      noteRestoreFailed: '恢复失败，请稍后重试',
      // ── Reader note (docs/reader-note-spec.md §7) ──────────────────────────
      readerNoteCreate: '建立笔记',
      readerNoteCreating: '正在建立…',
      readerNoteRecord: '记录笔记',
      readerNoteEdit: '修改笔记',
      readerNoteEditOpening: '正在打开…',
      readerNoteCreated: '阅读笔记已建立',
      readerNoteCreateFailed: '建立阅读笔记失败，请在 Obsidian 设置里检查库路径',
      readerNoteLostConfirm: '原笔记文件已丢失（{path}），要重新建立吗？',
      readerNoteDockTitle: '阅读笔记',
      readerNoteDockHint: '记录会追加到 Obsidian 笔记的末尾',
      readerNoteDockResize: '拖动这里调整面板高度',
      readerNotePlaceholder: '在这里记 Markdown 笔记，Ctrl+Enter 记录…',
      readerNoteWrite: '编辑',
      readerNotePreview: '预览',
      readerNotePreviewEmpty: '还没有内容，切回编辑开始记录',
      readerNoteWords: '{count} 字',
      readerNoteSubmit: '记录',
      readerNoteSubmitting: '记录中…',
      readerNoteRecorded: '已记录到笔记',
      readerNoteRecordFailed: '记录失败，请稍后重试',
      readerNoteEmpty: '先写点什么再记录',
      readerNoteCancelConfirm: '这条记录还没提交，放弃吗？',
      readerNoteShortcuts: '快捷键',
      readerNoteShortcutsTitle: '快捷键（macOS 上 Cmd 等价 Ctrl）',
      readerNoteShortcutRecord: '记录',
      readerNoteShortcutClose: '关闭面板',
      readerNoteShortcutFontUp: '放大字号',
      readerNoteShortcutFontDown: '缩小字号',
      readerNoteShortcutFontReset: '复位字号',
      readerNoteFontSize: '字号',
      readerNoteResetFont: '复位字号',
      readerNoteClose: '关闭记录面板',
      readerNoteImage: '插入图片',
      readerNoteBold: '加粗',
      readerNoteItalic: '斜体',
      readerNoteLink: '链接',
      readerNoteH1: '一级标题',
      readerNoteH2: '二级标题',
      readerNoteH3: '三级标题',
      readerNoteBullet: '无序列表',
      readerNoteOrdered: '有序列表',
      readerNoteQuote: '引用',
      readerNoteCode: '行内代码',
      readerNoteMath: '行内公式',
      readerNoteMathBlock: '块公式',
      readerNoteShortcutBold: '加粗',
      readerNoteShortcutItalic: '斜体',
      readerNoteShortcutLink: '链接',
      readerNoteShortcutHeading: '一 / 二 / 三级标题',
      readerNoteShortcutBody: '恢复正文',
      readerNoteShortcutBullet: '无序列表',
      readerNoteShortcutOrdered: '有序列表',
      readerNoteShortcutQuote: '引用',
      readerNoteShortcutCode: '行内代码',
      readerNoteShortcutMath: '行内公式',
      readerNoteShortcutMathBlock: '块公式',
      readerNoteShortcutImage: '插入图片',
      readerNoteImageUploading: '正在上传图片…',
      readerNoteImageFailed: '图片上传失败，请稍后重试',
      readerNoteImageTooLarge: '图片不能超过 8 MB',
      readerNoteImageType: '只支持 PNG 或 JPEG 图片',
      readerNoteDraftRestored: '已恢复上次未提交的草稿',
      readerNoteOrganize: '整理笔记',
      readerNoteOrganizing: '正在整理笔记…',
      readerNoteOrganizeDone: '已修正 {typos} 处错别字、合并 {merges} 处重复、整理 {formatting} 处格式',
      readerNoteOrganizeNoChange: '笔记已经足够整洁，本次没有改动',
      readerNoteOrganizeFailed: '整理失败，请稍后重试',
      readerNoteOrganizeConflict: '笔记已在别处更新，请重新打开面板后再整理',
      readerNoteOrganizeTooLong: '笔记过长（{chars} 字），超出模型单次整理范围，本次整理已放弃',
      readerNoteOrganizeMissing: '还没有建立阅读笔记',
      readerNoteQuestionsTitle: '疑似错误',
      readerNoteQuestionsSubtitle: '逐条确认后再决定是否修正',
      readerNoteQuestionQuote: '原文',
      readerNoteQuestionProblem: '问题',
      readerNoteQuestionAsk: '请确认',
      readerNoteQuestionPlaceholder: '补充说明或回答…',
      readerNoteQuestionDiscuss: '与 AI 讨论',
      readerNoteQuestionDiscussing: '正在讨论…',
      readerNoteQuestionAskInChat: '在 AI 对话中继续讨论',
      readerNoteQuestionApply: '按讨论结果修正',
      readerNoteQuestionDismiss: '保留原文',
      readerNoteQuestionResolved: '已修正',
      readerNoteQuestionDismissed: '已保留原文',
      readerNoteQuestionFailed: '处理失败，请稍后重试',
      readerNoteQuestionsOpen: '{count} 条待确认',
      readerNoteQuestionsAllDone: '所有疑似错误都已处理',
      readerNoteQuestionsEmpty: '本次整理没有发现疑似错误',
      readerNoteBadgeCount: '{count} 条待确认',
      readerNoteShowAllNotes: '显示全部笔记',
      readerNoteOnlyStandalone: '只看独立笔记',
      readerNoteStandalone: '独立笔记',
      readerNoteBadgeSummary: '总结',
      readerNoteBadgeNote: '笔记',
      readerNoteOpenSummary: '打开速览总结',
      readerNoteOpenReaderNote: '打开阅读笔记',
      readerNoteMissingSummary: '尚未生成总结',
      readerNoteMissingNote: '尚未生成笔记',
      readerNoteExpandRow: '展开这篇文献的总结与笔记',
      readerNoteCollapseRow: '收起',
      readerNoteDeleteKeep: '只删记录',
      readerNoteDeleteKeepDesc: '插件里的页面缓存、批注与问答会删除；Obsidian 里的 PDF、速览总结与阅读笔记全部保留。',
      readerNoteDeleteSummary: '连同速览总结',
      readerNoteDeleteSummaryDesc: '额外删除「{name} 总结.md」，先移入插件备份目录，可以还原。',
      readerNoteDeleteAll: '连同总结与笔记',
      readerNoteDeleteAllDesc: '额外删除「{name} 总结.md」「{name} 笔记.md」与 _附件 图片，都先移入插件备份目录，可以还原。',
      readerNoteDeleteChoiceTitle: 'Obsidian 里的文件怎么处理',
      readerNoteDeleteBackup: '删除的内容会先移入插件备份目录，可以还原。',
      readerNoteHistory: '历史',
      readerNoteHistoryTitle: '笔记历史版本',
      readerNoteHistoryEmpty: '暂无历史版本',
      readerNoteHistoryFailed: '历史版本加载失败',
      readerNoteHistoryPreview: '预览此版本',
      readerNoteHistorySourceAppend: '记录',
      readerNoteHistorySourceOrganize: '整理',
      readerNoteHistorySourceResolve: '修正',
      readerNoteHistorySourceRestore: '恢复',
      readerNoteHistorySourceManual: '手动保存',
      readerNoteLoadFailed: '读取笔记失败，请稍后重试',
      readerNoteUnreachable: '无法连接后端服务，请检查后重试',
    }
    const en = {
      panel: 'Literature Reader',
      library: 'Library',
      libraryTitle: 'Literature library',
      backToReader: 'Back to reading',
      allItems: 'All literature',
      pdfTab: 'PDFs',
      notesTab: 'Notes',
      includeChildren: 'Include subfolders',
      searchLibrary: 'Search title, file name or tag…',
      refresh: 'Refresh',
      newFolder: 'New folder',
      importHere: 'Import into this folder',
      foldersCount: 'folders',
      pdfsCount: 'PDFs',
      notesCount: 'notes',
      read: 'Read',
      continueReading: 'Continue',
      editItem: 'Edit',
      editItemTitle: 'Edit paper',
      titleLabel: 'Title',
      fileNameLabel: 'PDF file name',
      tagsLabel: 'Tags (comma separated)',
      save: 'Save',
      saving: 'Saving…',
      renameWarning: 'Renaming the file renames the actual PDF and updates recognizable [[links]] in the vault. You can also rename the linked note with the option below. Make sure Obsidian has no unsaved edits before saving.',
      renameNoteToggle: 'Rename the linked note too',
      renameNoteTarget: 'Note will be renamed to: {name}',
      keepNoteName: 'Keep the current note filename; only links and metadata will be updated.',
      associatedNote: 'Linked note',
      noAssociatedNote: 'No linked note yet; saving tags will create a same-name note',
      detachedTitle: 'Plugin cache (not in Obsidian)',
      emptyFolderPdfs: 'No PDFs in this folder yet',
      emptyFolderNotes: 'No Markdown notes in this folder yet',
      createFolderTitle: 'New folder',
      folderName: 'Folder name',
      create: 'Create',
      libraryLoading: 'Scanning the Obsidian vault…',
      noSearchResults: 'No matching literature',
      statusUnread: 'Unread',
      statusProcessing: 'Processing',
      statusReady: 'Read',
      statusError: 'Needs attention',
      openNote: 'Open note',
      editVaultItem: 'Edit name & tags',
      saved: 'Saved',
      vaultRoot: 'Vault root',
      legacyOpen: 'Open',
      syncHint: 'The library mirrors your Obsidian folders; PDFs added in Obsidian appear here automatically.',
      summary: 'Generate summary',
      regenerateSummary: 'Regenerate summary',
      preview: 'Preview',
      close: 'Close',
      cancel: 'Cancel',
      send: 'Send',
      stop: 'Stop',
      retry: 'Retry',
      delete: 'Delete',
      confirmDelete: 'Delete this paper with its pages, annotations and chat history?',
      deleteFolder: 'Delete folder',
      deletePdf: 'Delete paper',
      deleteNote: 'Delete note',
      deleteCache: 'Delete cache',
      renameFolder: 'Rename folder',
      rename: 'Rename',
      renameFolderHint: 'Only the folder name changes; its files move with it and vault path links are updated automatically.',
      relatedNotes: 'Linked notes',
      relatedNotesHint: 'These notes reference this paper. They are kept by default; tick the option to delete them too.',
      noRelatedNotes: 'No linked notes',
      deleteNotesToggle: 'Delete these linked notes too',
      confirmDeleteFolder: 'Delete the folder "{name}" with its {pdfs} papers and {notes} notes?',
      confirmDeleteNote: 'Delete this note from Obsidian?',
      confirmDeletePdf: 'Delete this paper from Obsidian?',
      deleteCacheOnly: 'Only the plugin reading cache is removed; files in Obsidian are untouched.',
      deletePdfWarning: 'The PDF moves to the plugin backup; cached pages, annotations, chat and summary copies are removed.',
      deleteNoteWarning: 'The note moves to the plugin backup and disappears from the library.',
      deleteFolderWarning: 'The folder and everything inside move to the plugin backup and disappear from the library.',
      deleteBackupHint: 'Deleted content moves to the plugin backup folder {path}, recoverable in Explorer.',
      deleting: 'Deleting…',
      dragHint: 'Drag the card onto a folder on the left to move it',
      dropHere: 'Drop to move into "{name}"',
      movedOk: 'Moved to "{folder}"',
      folderRenamedOk: 'Folder renamed',
      folderRenamedSanitized: 'The name contained special characters; saved as "{name}"',
      folderRenameUnchanged: 'Folder name did not change',
      busyMoveBlocked: 'A paper is being processed; try moving it afterwards',
      deletedOk: 'Deleted',
      emptyTitle: 'Turn papers into your own knowledge',
      emptyDesc: 'Import a PDF and the AI reads it first. Select any passage to ask, draw on the page, then generate a tagged Obsidian summary.',
      emptyImport: 'Import your first paper',
      featureRead: 'Read first',
      featureReadDesc: 'The AI studies the full text, formulas and findings in the background.',
      featureAsk: 'Ask a selection',
      featureAskDesc: 'Drag a box; the screenshot and context go to the AI together.',
      featureNote: 'Obsidian notes',
      featureNoteDesc: 'Questions, takeaways and tags become a Markdown note.',
      aiReader: 'AI reading assistant',
      processing: 'Processing',
      ready: 'Read',
      failed: 'Needs attention',
      pagesUnit: 'pages',
      reading: 'AI is reading',
      noText: 'No text extracted yet',
      resizeHint: 'Drag to resize the reading and AI panels; double-click to reset to 74%',
      selectTool: 'Select',
      penTool: 'Pen',
      eraserTool: 'Eraser',
      panTool: 'Pan',
      fullscreen: 'Full screen',
      exitFullscreen: 'Exit full screen',
      fullscreenFailed: 'Full screen is unavailable in this environment',
      width: 'Width',
      eraserSize: 'Eraser size',
      undo: 'Undo',
      chapter: 'Chapter',
      extract: 'Summarize',
      customRange: 'Custom range',
      startPage: 'Start',
      endPage: 'End',
      selectChapter: 'Choose a chapter',
      outlineLoading: 'Detecting chapters…',
      translate: 'Translate',
      term: 'Explain term',
      explain: 'Explain',
      points: 'Key points',
      critique: 'Critique',
      quickAsk: 'Quick ask',
      selectionExists: 'Selection',
      selectionAsk: 'Ask',
      questionPlaceholder: 'Ask about this paper, or select a passage…',
      chatDisabled: 'The AI is still reading this paper',
      pageContext: 'Page {page}',
      selectionContext: 'Page {page} · selection',
      clearSelection: 'Clear selection',
      analysisTitle: 'AI reading notes',
      analysisOpen: 'View',
      analysisMissing: 'Reading notes are not ready',
      readingDigest: 'Reading digest',
      summaryReady: 'Summary ready',
      readingHint: 'The AI is reading the full paper. You can ask, translate or summarise once it finishes.',
      starter1: 'Summarise this paper in three sentences',
      starter2: 'Explain the meaning of Figure 1',
      starter3: 'What is the biggest limitation of this work?',
      vaultKicker: 'OBSIDIAN VAULT',
      summaryRunning: 'Writing summary…',
      summaryPreparing: 'Checking which terms need explaining…',
      glossaryTitle: 'Include these terms in the glossary?',
      glossaryIntro: "The AI couldn't tell whether these are technical terms from this paper — please confirm.",
      glossarySelectAll: 'Select all',
      glossarySelectNone: 'Select none',
      glossaryStart: 'Start generating',
      glossaryCancel: 'Cancel',
      glossaryIncluded: '{count} more are already confirmed',
      summaryDone: 'Summary ready',
      summaryFailed: 'Could not generate summary',
      summaryPreview: 'Summary',
      openObsidian: 'Open in Obsidian',
      writingObsidian: 'Writing to Obsidian…',
      imported: 'Imported, parsing in the background',
      upload: 'Uploading',
      uploadDone: 'Upload complete',
      processingImport: 'The AI is parsing and reading; progress appears here',
      noPapers: 'No papers yet',
      searchPlaceholder: 'Search title, author or tag…',
      open: 'Open',
      model: 'Model',
      analysisWarning: 'AI reading is incomplete',
      retryRead: 'Read again',
      pageOf: 'of',
      summaryExists: 'This paper already has a summary. Regenerating will overwrite the same file. Continue?',
      annotateSaved: 'Annotation saved',
      summaryWritten: 'Written to Obsidian',
      wordSaved: 'Added to “{note}” as entry {number}',
      wordDuplicateTitle: 'This word or phrase is already saved',
      wordDuplicateSubtitle: 'Nothing was written twice',
      wordDuplicateBody: '“{term}” already exists in “{note}” (entry {number}): {translation}.',
      wordDuplicateSection: 'Filed under “{section}”.',
      wordDuplicateHint: 'If it is used differently here, confirm in Obsidian and add a note there.',
      wordRecordError: 'Could not write to Obsidian: {message}',
      notePath: 'Summary file',
      copied: 'Copied',
      readAnalysis: 'Reading notes',
      emptyChat: 'Ask from wherever you are reading.',
      emptyChatDesc: 'Ask about one concept, or select a passage to translate or explain.',
      startReading: 'Start reading',
      libraryHint: 'Choose a paper to continue',
      collapse: 'Collapse',
      expand: 'Expand',
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
      zoomReset: 'Reset to 100%',
      zoomHint: 'Ctrl/⌘ + wheel zooms around the cursor; click the percentage to reset to 100%',
      more: 'More',
      citationJump: 'Jump to page {page}',
      noSelection: 'Select a passage on the PDF first',
      stopGeneration: 'Stop generating',
      importedFile: 'Selected',
      loadFailed: 'Load failed',
      hostUnavailable: 'Literature Reader service is not running. Make sure the plugin is enabled.',
      summaryNeedsText: 'This paper has no usable text, so a summary is not available yet',
      modelPicker: 'Model and thinking effort',
      modelPickerTitle: 'Choose a model',
      modelPickerSubtitle: 'This only applies to the Literature Reader, not to the DSH default model.',
      modelService: 'Provider',
      modelSection: 'Model',
      effortSection: 'Thinking effort',
      effortAuto: 'Follow the model',
      effortAutoDesc: "Use the model's own default effort",
      effortUnsupported: 'This model has no adjustable thinking effort',
      effortActive: 'Now: {effort}',
      effortSwitching: 'Switching…',
      modelSaved: 'Switched to {model}',
      modelSaveFailed: 'Switch failed: {message}',
      noModels: 'No models available',
      noModelsHint: 'Configure a model provider in DSH settings first, then pick it here.',
      modelNoImage: 'No image input',
      modelNoImageHint: 'This model cannot be used for scanned OCR or selection screenshots.',
      modelImagesOk: 'Supports screenshots',
      modelLoading: 'Reading the model list…',
      modelEffortNow: 'Thinking effort: {effort}',
      modelEffortAuto: 'Thinking effort: model default',
      modelCurrent: 'Current model',
      fontSize: 'Text size',
      fontSizeTitle: 'Reading text size',
      fontSizeHint: 'Adjusts the reading pane and the input box only.',
      fontSizeSmaller: 'Decrease text size',
      fontSizeLarger: 'Increase text size',
      fontSizeReset: 'Reset to default',
      fontSizeNow: '{size}%',
      fontSizeSmall: 'Small',
      fontSizeNormal: 'Normal',
      fontSizeLarge: 'Large',
      fontSizeHuge: 'Huge',
      modelNeedsRestart: 'The model picker needs a DSH host restart. The page reloaded but the host is still running the old version.',
      noteLoading: 'Loading summary…',
      noteLoadFailed: 'Could not load the summary',
      noteBack: 'Back to reading',
      noteOpen: 'Summary',
      import: 'Import PDF',
      chevronLeft: 'Previous page',
      chevronRight: 'Next page',
      noteMore: 'More',
      noteKind: 'Quick-recall summary',
      noteWordCount: '{count} chars',
      notePreviewTab: 'Preview',
      noteEditorTab: 'Edit',
      noteSaving: 'Saving…',
      noteSaved: 'Saved',
      noteUnsaved: 'Unsaved',
      noteSaveFailedShort: 'Save failed',
      noteSaveFailed: 'Could not save, please try again',
      noteReloaded: 'Reloaded the latest note',
      noteLeaveBody: 'You have unsaved changes. Leave the summary anyway?',
      noteLeaveEditBody: 'You have unsaved changes. Leave the editor anyway?',
      noteConflictBody: 'The note changed elsewhere (maybe saved from Obsidian). Overwrite it, or reload the latest version.',
      noteConflictOverwrite: 'Overwrite',
      noteConflictReload: 'Reload',
      noteGenerate: 'Generate summary',
      noteEmptyBody: 'This paper has no summary yet',
      noteEmptyHint: 'A summary is for quick recall. Once generated, select any passage to annotate it and let the AI revise from your notes.',
      noteVaultBanner: 'This note was edited in Obsidian ({time}). Saving here will overwrite those edits.',
      noteVaultView: 'View Obsidian version',
      noteVaultTitle: 'Version in Obsidian',
      noteVaultReadOnly: 'Read-only preview. Version history only covers the local copy, not text written directly in Obsidian — copy anything you want to keep.',
      noteVaultCopy: 'Copy all',
      noteVaultCopied: 'Copied to clipboard',
      noteVaultCopyFailed: 'Could not copy, please select the text manually',
      noteVaultLoadFailed: 'Could not read the Obsidian version',
      noteVaultMissing: 'The note is missing from Obsidian; it may have been deleted there',
      noteVaultOverwritten: 'Saved. Your earlier Obsidian edits were overwritten — version history only covers the local copy, not text written directly in Obsidian.',
      noteEditorHint: 'Ctrl/Cmd + S to save',
      noteEditorWords: '{count} chars',
      noteEditorCancel: 'Exit editor',
      noteEditorDraft: 'Unsubmitted draft found',
      noteEditorDraftRestore: 'Restore draft',
      noteEditorDraftDiscard: 'Discard',
      noteAnnotate: 'Annotate',
      noteAnnColor: 'Colour',
      noteAnnPlaceholder: 'What is unclear, missing, or wrong here?',
      noteAnnNeedNote: 'Write a short comment before saving',
      noteAnnSave: 'Save annotation',
      noteAnnSaved: 'Annotation saved',
      noteAnnEdit: 'Edit annotation',
      noteAnnDelete: 'Delete',
      noteAnnDeleted: 'Annotation deleted',
      noteAnnDeleteConfirm: 'Delete this annotation?',
      noteAnnSaveFailed: 'Could not save the annotation',
      noteAnnFailedLocate: 'That text can no longer be located, please select it again',
      noteAnnSelectFirst: 'Select some text in the note first',
      noteAnnShortcut: 'Ctrl/Cmd + Enter to save, Esc to cancel',
      noteAnnCount: 'Annotations',
      noteAnnOpen: 'To apply',
      noteAnnResolved: 'Applied',
      noteAnnOrphan: 'Lost',
      noteAnnEmpty: 'No annotations yet',
      noteAnnEmptyHint: 'Select a sentence and leave your annotation.',
      noteAnnLocate: 'Locate',
      noteAnnReply: 'AI note',
      noteAnnPanelToggle: 'Annotations',
      noteAnnExpandAll: 'Expand all',
      noteAnnCollapseAll: 'Collapse all',
      noteAnnLost: '{count} annotations were lost because the note changed',
      noteColorAmber: 'Amber',
      noteColorRose: 'Rose',
      noteColorSky: 'Sky',
      noteColorMint: 'Mint',
      noteStatusOpen: 'To apply',
      noteStatusResolved: 'Applied',
      noteStatusOrphan: 'Lost',
      noteCalloutAbstract: 'Abstract',
      noteCalloutFigure: 'Figure',
      noteCalloutWarning: 'Warning',
      noteCalloutQuestion: 'Question',
      noteCalloutTip: 'Tip',
      noteCalloutInfo: 'Note',
      noteApply: 'Apply changes',
      noteApplyPending: '{count} annotations to apply',
      noteApplyHint: 'Nothing changes until you apply.',
      noteApplyInstruction: 'Extra request (optional), e.g. explain section 5 in more detail',
      noteApplying: 'Applying your annotations…',
      noteApplyingFigure: 'Adding figures {index}/{total}…',
      noteApplyDone: 'Applied {count} annotations',
      noteApplyUnresolved: 'Applied {applied}, {unresolved} could not be applied',
      noteApplyFailed: 'Revision failed, please try again',
      noteInsertImage: 'Insert image',
      noteInsertTitle: 'Insert an image',
      noteInsertUpload: 'Upload image',
      noteInsertCrop: 'Crop from PDF',
      noteInsertPickFile: 'Choose an image (PNG / JPEG)',
      noteInsertPreview: 'Preview',
      noteInsertPage: 'Page {page} / {total}',
      noteInsertPrevPage: 'Previous page',
      noteInsertNextPage: 'Next page',
      noteInsertDragHint: 'Drag on the page to select the region',
      noteInsertLoadingPage: 'Loading page…',
      noteInsertNoRegion: 'Select a region on the page first',
      noteInsertPosition: 'Placement',
      noteInsertPosAuto: 'Let the AI decide',
      noteInsertPosSection: 'After a section',
      noteInsertPosCursor: 'At the cursor',
      noteInsertCursorHint: 'Inserted at the editor cursor; falls back to the end of the note.',
      noteInsertInstruction: 'Tell me where it goes; if unsure, I will ask you',
      noteInsertSubmit: 'Insert',
      noteInserting: 'Inserting…',
      noteInsertFailed: 'Could not insert the image, please try again',
      noteInsertTypeBad: 'Only PNG or JPEG images are supported',
      noteInsertTooLarge: 'The image must be under 8 MB',
      noteInserted: 'Image inserted into the note',
      noteQuestionTitle: 'Where should this figure go?',
      noteQuestionRound: 'Round {round}',
      noteQuestionAnswerPlaceholder: 'Answer the question above and the AI will place the figure…',
      noteQuestionSubmit: 'Answer and insert',
      noteQuestionForce: 'Let the AI decide',
      noteQuestionFailed: 'Could not use that answer, please try again',
      noteFixFigures: 'Fill in figures',
      noteFiguresRunning: 'Creating figures for placeholders…',
      noteFiguresProgress: 'Figures {index}/{total}',
      noteFiguresDone: 'Inserted {created} figures, {failed} failed',
      noteFiguresFailed: 'Could not create the figures, please try again',
      noteNoPlaceholders: 'This note has no figure placeholders',
      noteHistory: 'History',
      noteHistoryTitle: 'Version history',
      noteHistoryLoading: 'Loading history…',
      noteHistoryEmpty: 'No earlier versions yet',
      noteHistoryFailed: 'Could not load the history',
      noteHistoryChars: '{count} chars',
      noteHistoryPreview: 'Preview',
      noteHistoryPreviewTitle: 'Version preview',
      noteHistoryPreviewReadOnly: 'Read-only preview; the note changes only after you restore',
      noteHistoryRestore: 'Restore',
      noteHistoryRestoreConfirm: 'Restoring this version replaces the current note (which is saved to history first). Continue?',
      noteHistorySourceAuto: 'Generated',
      noteHistorySourceManual: 'Manual save',
      noteHistorySourceRevision: 'Revised from annotations',
      noteHistorySourceRestore: 'Restored',
      noteHistorySourceUnknown: 'Other',
      noteRestoreDone: 'Version restored',
      noteRestoreFailed: 'Could not restore that version, please try again',
      // ── Reader note (docs/reader-note-spec.md §7) ──────────────────────────
      readerNoteCreate: 'Create note',
      readerNoteCreating: 'Creating…',
      readerNoteRecord: 'Add entry',
      readerNoteEdit: 'Edit note',
      readerNoteEditOpening: 'Opening…',
      readerNoteCreated: 'Reader note created',
      readerNoteCreateFailed: 'Could not create the reader note; check the vault path in the Obsidian settings',
      readerNoteLostConfirm: 'The note file is gone ({path}). Create it again?',
      readerNoteDockTitle: 'Reader note',
      readerNoteDockHint: 'Entries are appended to the end of the Obsidian note',
      readerNoteDockResize: 'Drag to resize the panel',
      readerNotePlaceholder: 'Write Markdown here; Ctrl+Enter to record…',
      readerNoteWrite: 'Write',
      readerNotePreview: 'Preview',
      readerNotePreviewEmpty: 'Nothing yet — switch back to Write to start',
      readerNoteWords: '{count} chars',
      readerNoteSubmit: 'Record',
      readerNoteSubmitting: 'Recording…',
      readerNoteRecorded: 'Added to the note',
      readerNoteRecordFailed: 'Could not record that entry, please try again',
      readerNoteEmpty: 'Write something first',
      readerNoteCancelConfirm: 'This entry is not recorded yet. Discard it?',
      readerNoteShortcuts: 'Shortcuts',
      readerNoteShortcutsTitle: 'Shortcuts (Cmd equals Ctrl on macOS)',
      readerNoteShortcutRecord: 'Record',
      readerNoteShortcutClose: 'Close panel',
      readerNoteShortcutFontUp: 'Larger text',
      readerNoteShortcutFontDown: 'Smaller text',
      readerNoteShortcutFontReset: 'Reset text size',
      readerNoteFontSize: 'Text size',
      readerNoteResetFont: 'Reset text size',
      readerNoteClose: 'Close the note panel',
      readerNoteImage: 'Insert image',
      readerNoteBold: 'Bold',
      readerNoteItalic: 'Italic',
      readerNoteLink: 'Link',
      readerNoteH1: 'Heading 1',
      readerNoteH2: 'Heading 2',
      readerNoteH3: 'Heading 3',
      readerNoteBullet: 'Bulleted list',
      readerNoteOrdered: 'Numbered list',
      readerNoteQuote: 'Quote',
      readerNoteCode: 'Inline code',
      readerNoteMath: 'Inline math',
      readerNoteMathBlock: 'Display math',
      readerNoteShortcutBold: 'Bold',
      readerNoteShortcutItalic: 'Italic',
      readerNoteShortcutLink: 'Link',
      readerNoteShortcutHeading: 'Heading 1 / 2 / 3',
      readerNoteShortcutBody: 'Body text',
      readerNoteShortcutBullet: 'Bulleted list',
      readerNoteShortcutOrdered: 'Numbered list',
      readerNoteShortcutQuote: 'Quote',
      readerNoteShortcutCode: 'Inline code',
      readerNoteShortcutMath: 'Inline math',
      readerNoteShortcutMathBlock: 'Display math',
      readerNoteShortcutImage: 'Insert image',
      readerNoteImageUploading: 'Uploading the image…',
      readerNoteImageFailed: 'Could not upload the image, please try again',
      readerNoteImageTooLarge: 'The image must be under 8 MB',
      readerNoteImageType: 'Only PNG or JPEG images are supported',
      readerNoteDraftRestored: 'Restored the unsubmitted draft',
      readerNoteOrganize: 'Tidy note',
      readerNoteOrganizing: 'Tidying the note…',
      readerNoteOrganizeDone: 'Fixed {typos} typos, merged {merges} duplicates, cleaned up {formatting} formatting issues',
      readerNoteOrganizeNoChange: 'The note was already tidy; nothing changed',
      readerNoteOrganizeFailed: 'Could not tidy the note, please try again',
      readerNoteOrganizeConflict: 'The note changed elsewhere; reopen the panel and tidy again',
      readerNoteOrganizeTooLong: 'The note is too long ({chars} chars) for one tidy pass; this run was skipped',
      readerNoteOrganizeMissing: 'There is no reader note yet',
      readerNoteQuestionsTitle: 'Possible mistakes',
      readerNoteQuestionsSubtitle: 'Confirm each item before it changes the note',
      readerNoteQuestionQuote: 'Source',
      readerNoteQuestionProblem: 'Problem',
      readerNoteQuestionAsk: 'Please confirm',
      readerNoteQuestionPlaceholder: 'Add a note or answer…',
      readerNoteQuestionDiscuss: 'Discuss with AI',
      readerNoteQuestionDiscussing: 'Discussing…',
      readerNoteQuestionAskInChat: 'Continue in the AI chat',
      readerNoteQuestionApply: 'Apply the fix',
      readerNoteQuestionDismiss: 'Keep the original',
      readerNoteQuestionResolved: 'Fixed',
      readerNoteQuestionDismissed: 'Original kept',
      readerNoteQuestionFailed: 'Could not handle that item, please try again',
      readerNoteQuestionsOpen: '{count} to confirm',
      readerNoteQuestionsAllDone: 'Every possible mistake was handled',
      readerNoteQuestionsEmpty: 'This pass found no possible mistakes',
      readerNoteBadgeCount: '{count} to confirm',
      readerNoteShowAllNotes: 'Show all notes',
      readerNoteOnlyStandalone: 'Standalone notes only',
      readerNoteStandalone: 'Standalone',
      readerNoteBadgeSummary: 'Summary',
      readerNoteBadgeNote: 'Note',
      readerNoteOpenSummary: 'Open the summary',
      readerNoteOpenReaderNote: 'Open the reader note',
      readerNoteMissingSummary: 'No summary yet',
      readerNoteMissingNote: 'No note yet',
      readerNoteExpandRow: 'Show this paper’s summary and note',
      readerNoteCollapseRow: 'Collapse',
      readerNoteDeleteKeep: 'Record only',
      readerNoteDeleteKeepDesc: 'The plugin’s page cache, annotations and Q&A are removed; the PDF, summary and reader note stay in Obsidian.',
      readerNoteDeleteSummary: 'Also the summary',
      readerNoteDeleteSummaryDesc: 'Also removes “{name} 总结.md” into the plugin backup folder, where it can be restored.',
      readerNoteDeleteAll: 'Also the summary and note',
      readerNoteDeleteAllDesc: 'Also removes “{name} 总结.md”, “{name} 笔记.md” and the _附件 images into the plugin backup folder, where they can be restored.',
      readerNoteDeleteChoiceTitle: 'What should happen to the Obsidian files',
      readerNoteDeleteBackup: 'Everything removed goes to the plugin backup folder first and can be restored.',
      readerNoteHistory: 'History',
      readerNoteHistoryTitle: 'Note version history',
      readerNoteHistoryEmpty: 'No earlier versions yet',
      readerNoteHistoryFailed: 'Could not load the version history',
      readerNoteHistoryPreview: 'Preview this version',
      readerNoteHistorySourceAppend: 'Entry',
      readerNoteHistorySourceOrganize: 'Organize',
      readerNoteHistorySourceResolve: 'Correction',
      readerNoteHistorySourceRestore: 'Restore',
      readerNoteHistorySourceManual: 'Manual save',
      readerNoteLoadFailed: 'Could not read the note, please try again',
      readerNoteUnreachable: 'Cannot reach the host service, please check and retry',
    }
    let t = (key) => zh[key] || key
    // Cross-plugin layout service, bound in apply(). Fullscreen uses it to
    // collapse the host sidebar for the duration of the mode.
    let layoutService = null

// #region markdown-core
const MD_FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`]*)$/
const MD_CLOSING_FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
const MD_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/
const MD_HR_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const MD_QUOTE_LINE_RE = /^ {0,3}>[ ]?(.*)$/
const MD_LIST_RE = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/
const MD_IMAGE_RE = /^ {0,3}!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)\s*$/
const MD_TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const MD_CALLOUT_RE = /^\[!([A-Za-z0-9_-]+)\]([+-])?[ \t]*(.*)$/
const MD_CITE_RE = /^\[p\.\s*\d+(?:\s*[-–]\s*\d+)?\]/i
const MD_FIGURE_LINE_RE = /^[ \t]*\[\[FIGURE:([\s\S]*?)\]\][ \t]*$/
const MD_FIGURE_PAGE_RE = /^(?:p\.?\s*)?(\d+)$/i
const MD_WS_RE = /[ \t\n\r\f\v]/

function mdIsBlank(value) {
  return /^[ \t]*$/.test(value)
}

function mdClip(value, limit) {
  const text = typeof value === 'string' ? value : String(value === undefined || value === null ? '' : value)
  return text.length > limit ? text.slice(0, limit) : text
}

// Split the normalised source into lines carrying absolute source offsets.
function mdSplitLines(source) {
  const lines = []
  let index = 0
  for (;;) {
    const newline = source.indexOf('\n', index)
    if (newline === -1) {
      lines.push({ text: source.slice(index), start: index, end: source.length })
      break
    }
    lines.push({ text: source.slice(index, newline), start: index, end: newline })
    index = newline + 1
  }
  return lines
}

// Inline parser. `text` is a contiguous slice of the source that starts at
// `base`, so every element keeps exact source offsets even after the markers
// are stripped from the rendered text.
function mdParseInline(value, base) {
  const text = typeof value === 'string' ? value : ''
  const offset = Number.isFinite(base) ? base : 0
  const inline = []
  let bufferStart = 0
  let index = 0
  const flush = (end) => {
    if (end > bufferStart) {
      inline.push({
        type: 'text',
        text: text.slice(bufferStart, end),
        srcStart: offset + bufferStart,
        srcEnd: offset + end,
      })
    }
  }
  while (index < text.length) {
    const char = text[index]
    if (char === '\\' && index + 1 < text.length) {
      index += 2
      continue
    }
    if (char === '`') {
      const close = text.indexOf('`', index + 1)
      if (close > index + 1) {
        flush(index)
        inline.push({
          type: 'code',
          text: text.slice(index + 1, close),
          srcStart: offset + index + 1,
          srcEnd: offset + close,
        })
        index = close + 1
        bufferStart = index
        continue
      }
    }
    if (char === '*' || char === '_') {
      const doubled = text[index + 1] === char
      if (doubled) {
        const close = text.indexOf(char + char, index + 2)
        if (close > index + 1) {
          flush(index)
          inline.push({
            type: 'strong',
            text: text.slice(index + 2, close),
            srcStart: offset + index + 2,
            srcEnd: offset + close,
          })
          index = close + 2
          bufferStart = index
          continue
        }
      } else if (!(char === '_' && /[A-Za-z0-9]/.test(text[index + 1] || ''))) {
        const close = text.indexOf(char, index + 1)
        if (close > index + 1) {
          flush(index)
          inline.push({
            type: 'em',
            text: text.slice(index + 1, close),
            srcStart: offset + index + 1,
            srcEnd: offset + close,
          })
          index = close + 1
          bufferStart = index
          continue
        }
      }
    }
    if (char === '[') {
      const cite = MD_CITE_RE.exec(text.slice(index))
      if (cite) {
        flush(index)
        inline.push({
          type: 'cite',
          text: cite[0],
          srcStart: offset + index,
          srcEnd: offset + index + cite[0].length,
        })
        index += cite[0].length
        bufferStart = index
        continue
      }
      const close = text.indexOf(']', index + 1)
      if (close > index && text[close + 1] === '(') {
        const end = text.indexOf(')', close + 2)
        if (end > close + 1) {
          flush(index)
          inline.push({
            type: 'link',
            text: text.slice(index + 1, close),
            srcStart: offset + index + 1,
            srcEnd: offset + close,
            href: text.slice(close + 2, end),
          })
          index = end + 1
          bufferStart = index
          continue
        }
      }
    }
    index += 1
  }
  flush(text.length)
  return inline
}

function mdLooksLikeTable(lines, at) {
  if (at + 1 >= lines.length) return false
  const header = lines[at].text
  const delimiter = lines[at + 1].text
  if (header.indexOf('|') === -1 || delimiter.indexOf('|') === -1) return false
  return MD_TABLE_DELIM_RE.test(delimiter)
}

// Build the inline runs of a multi-line paragraph one line at a time. Parsing
// the joined text in one slice would be cheaper, but quoted blocks are
// reconstructed without their `> ` markers, so neighbouring lines are not
// contiguous in the source. A synthetic newline element keeps the mapping
// monotonic in both cases.
function mdJoinLineInline(lines, from, to) {
  const inline = []
  for (let index = from; index < to; index += 1) {
    if (index > from) {
      const offset = lines[index - 1].end
      inline.push({ type: 'text', text: '\n', srcStart: offset, srcEnd: offset + 1 })
    }
    for (const item of mdParseInline(lines[index].text, lines[index].start)) inline.push(item)
  }
  return inline
}

function mdStartsBlock(lines, at) {
  const value = lines[at].text
  if (mdIsBlank(value)) return true
  if (MD_FENCE_RE.test(value)) return true
  if (MD_HEADING_RE.test(value)) return true
  if (MD_HR_RE.test(value)) return true
  if (MD_QUOTE_LINE_RE.test(value)) return true
  if (MD_IMAGE_RE.test(value)) return true
  if (MD_LIST_RE.test(value)) return true
  return mdLooksLikeTable(lines, at)
}

// Split one table row into trimmed cells that keep their source offsets.
function mdSplitTableRow(line) {
  const raw = line.text
  const cells = []
  let segmentStart = 0
  let index = 0
  const push = (from, to) => {
    let left = from
    let right = to
    while (left < right && /[ \t]/.test(raw[left])) left += 1
    while (right > left && /[ \t]/.test(raw[right - 1])) right -= 1
    cells.push({ text: raw.slice(left, right), start: line.start + left })
  }
  while (index <= raw.length) {
    if (index === raw.length || (raw[index] === '|' && raw[index - 1] !== '\\')) {
      push(segmentStart, index)
      segmentStart = index + 1
    }
    index += 1
  }
  if (cells.length > 0 && cells[0].text === '' && /^[ \t]*\|/.test(raw)) cells.shift()
  if (cells.length > 0 && cells[cells.length - 1].text === '' && /\|[ \t]*$/.test(raw)) cells.pop()
  return cells
}

// Translate every offset stored on a block (and its inline runs) through `map`.
function mdShiftBlocks(blocks, map) {
  const last = map.length - 1
  const at = (position) => {
    if (!Number.isFinite(position)) return map[0] || 0
    const clamped = Math.max(0, Math.min(last, Math.trunc(position)))
    return map[clamped]
  }
  const shiftInline = (inline) => {
    if (!Array.isArray(inline)) return
    for (const item of inline) {
      if (!item) continue
      item.srcStart = at(item.srcStart)
      item.srcEnd = at(item.srcEnd)
    }
  }
  for (const block of blocks) {
    if (!block) continue
    block.start = at(block.start)
    block.end = at(block.end)
    if (Number.isFinite(block.textStart)) block.textStart = at(block.textStart)
    shiftInline(block.inline)
    if (Array.isArray(block.items)) {
      for (const item of block.items) {
        if (!item) continue
        item.start = at(item.start)
        item.end = at(item.end)
        shiftInline(item.inline)
      }
    }
    if (Array.isArray(block.header)) {
      for (const cell of block.header) shiftInline(cell)
    }
    if (Array.isArray(block.rows)) {
      for (const row of block.rows) {
        if (!Array.isArray(row)) continue
        for (const cell of row) shiftInline(cell)
      }
    }
    if (Array.isArray(block.blocks)) mdShiftBlocks(block.blocks, map)
  }
  return blocks
}

function mdParseBlocks(source) {
  const lines = mdSplitLines(source)
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const text = line.text
    if (mdIsBlank(text)) {
      index += 1
      continue
    }

    // Fenced code block.
    const fence = MD_FENCE_RE.exec(text)
    if (fence) {
      const marker = fence[1]
      const lang = (fence[2] || '').trim().split(/[ \t]+/)[0] || ''
      let close = index + 1
      while (close < lines.length) {
        const closing = MD_CLOSING_FENCE_RE.exec(lines[close].text)
        if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) break
        close += 1
      }
      const closed = close < lines.length
      const bodyLines = lines.slice(index + 1, close)
      // An unclosed fence runs to EOF; the trailing newline produces one empty
      // sentinel line that is not part of the code.
      if (!closed && bodyLines.length > 0 && bodyLines[bodyLines.length - 1].text === '') bodyLines.pop()
      const inner = bodyLines.map((item) => item.text).join('\n')
      const textStart = bodyLines.length > 0
        ? bodyLines[0].start
        : index + 1 < lines.length ? lines[index + 1].start : line.end
      blocks.push({
        type: 'code',
        lang,
        text: inner,
        textStart,
        start: line.start,
        end: closed ? lines[close].end : lines[lines.length - 1].end,
      })
      index = closed ? close + 1 : lines.length
      continue
    }

    // Heading.
    const heading = MD_HEADING_RE.exec(text)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const raw = heading[2] === undefined ? '' : heading[2]
      const contentOffset = text.length - raw.length
      const content = raw.replace(/[ \t]+#+[ \t]*$/, '').replace(/[ \t]+$/, '')
      blocks.push({
        type: 'heading',
        level,
        inline: mdParseInline(content, line.start + contentOffset),
        start: line.start,
        end: line.end,
      })
      index += 1
      continue
    }

    // Horizontal rule.
    if (MD_HR_RE.test(text)) {
      blocks.push({ type: 'hr', start: line.start, end: line.end })
      index += 1
      continue
    }

    // Table.
    if (mdLooksLikeTable(lines, index)) {
      const header = mdSplitTableRow(lines[index]).map((cell) => mdParseInline(cell.text, cell.start))
      let cursor = index + 2
      const rows = []
      while (cursor < lines.length && !mdIsBlank(lines[cursor].text) && lines[cursor].text.indexOf('|') !== -1) {
        rows.push(mdSplitTableRow(lines[cursor]).map((cell) => mdParseInline(cell.text, cell.start)))
        cursor += 1
      }
      blocks.push({ type: 'table', header, rows, start: line.start, end: lines[cursor - 1].end })
      index = cursor
      continue
    }

    // Block quote, with optional Obsidian callout marker on the first line.
    if (MD_QUOTE_LINE_RE.test(text)) {
      const collected = []
      let cursor = index
      while (cursor < lines.length) {
        const match = MD_QUOTE_LINE_RE.exec(lines[cursor].text)
        if (!match) break
        const value = match[1]
        collected.push({ text: value, start: lines[cursor].start + (lines[cursor].text.length - value.length) })
        cursor += 1
      }
      let callout = null
      const marker = MD_CALLOUT_RE.exec(collected[0].text)
      if (marker) {
        callout = { title: (marker[3] || '').trim(), kind: marker[1].toLowerCase() }
        // The callout title is metadata for the renderer, not body text.
        collected.shift()
      }
      const content = collected.map((item) => item.text).join('\n')
      const map = []
      collected.forEach((item, position) => {
        if (position > 0) map.push(item.start)
        for (let offset = 0; offset < item.text.length; offset += 1) map.push(item.start + offset)
      })
      const tail = cursor < lines.length ? lines[cursor].start : lines[lines.length - 1].end
      map.push(Math.max(tail, map.length > 0 ? map[map.length - 1] : tail))
      blocks.push({
        type: 'quote',
        blocks: mdShiftBlocks(mdParseBlocks(content), map),
        callout,
        start: line.start,
        end: lines[cursor - 1].end,
      })
      index = cursor
      continue
    }

    // Block image (own line).
    const image = MD_IMAGE_RE.exec(text)
    if (image) {
      blocks.push({ type: 'image', src: image[2], alt: image[1], start: line.start, end: line.end })
      index += 1
      continue
    }

    // Flat list; continuation lines are folded into the item and nested
    // markers stay plain text on purpose.
    const listItem = MD_LIST_RE.exec(text)
    if (listItem) {
      const ordered = /\d/.test(listItem[2])
      const items = []
      let cursor = index
      while (cursor < lines.length) {
        const item = MD_LIST_RE.exec(lines[cursor].text)
        if (!item) break
        if (/\d/.test(item[2]) !== ordered) break
        const contentStart = lines[cursor].start + item[1].length + item[2].length + item[3].length
        let inline = mdParseInline(item[4], contentStart)
        let itemEnd = lines[cursor].end
        let next = cursor + 1
        while (next < lines.length) {
          const continuation = lines[next].text
          if (mdIsBlank(continuation)) break
          if (MD_LIST_RE.test(continuation)) break
          if (mdStartsBlock(lines, next)) break
          if (!/^[ \t]/.test(continuation)) break
          const stripped = continuation.replace(/^[ \t]+/, '')
          const offset = lines[next].start + (continuation.length - stripped.length)
          inline = inline.concat(
            [{ type: 'text', text: '\n', srcStart: lines[next].start, srcEnd: lines[next].start + 1 }],
            mdParseInline(stripped, offset),
          )
          itemEnd = lines[next].end
          next += 1
        }
        items.push({ inline, start: lines[cursor].start, end: itemEnd })
        cursor = next
      }
      blocks.push({ type: 'list', ordered, items, start: line.start, end: items[items.length - 1].end })
      index = cursor
      continue
    }

    // Paragraph: consume lines until a blank line or the start of another block.
    let cursor = index + 1
    while (cursor < lines.length && !mdIsBlank(lines[cursor].text) && !mdStartsBlock(lines, cursor)) cursor += 1
    blocks.push({
      type: 'paragraph',
      inline: mdJoinLineInline(lines, index, cursor),
      start: line.start,
      end: lines[cursor - 1].end,
    })
    index = cursor
  }
  return blocks
}

/**
 * Parse Markdown into a block tree. Tolerant by design: unclosed markers,
 * unbalanced tables and odd indentation never throw.
 * @param {string} source
 * @returns {{ blocks: object[] }}
 */
function parseMarkdown(source) {
  try {
    const text = typeof source === 'string' ? source : ''
    return { blocks: mdParseBlocks(text.replace(/\r\n?/g, '\n')) }
  } catch {
    return { blocks: [] }
  }
}

function mdPushRun(state, value, offsetAt) {
  if (typeof value !== 'string' || value.length === 0) return
  for (let index = 0; index < value.length; index += 1) state.map.push(offsetAt(index))
  state.text += value
}

function mdPushInline(state, inline) {
  if (!Array.isArray(inline)) return
  for (const item of inline) {
    if (!item || typeof item.text !== 'string' || item.text.length === 0) continue
    const base = Number.isFinite(item.srcStart) ? item.srcStart : 0
    mdPushRun(state, item.text, (index) => base + index)
  }
}

function mdInlineStart(inline, fallback) {
  if (Array.isArray(inline)) {
    for (const item of inline) {
      if (item && Number.isFinite(item.srcStart)) return item.srcStart
    }
  }
  return Number.isFinite(fallback) ? fallback : 0
}

function mdProjectBlock(block, state) {
  if (block.type === 'heading' || block.type === 'paragraph') {
    mdPushInline(state, block.inline)
    return
  }
  if (block.type === 'list') {
    const items = Array.isArray(block.items) ? block.items : []
    items.forEach((item, position) => {
      if (!item) return
      if (position > 0) mdPushRun(state, '\n', () => (Number.isFinite(item.start) ? item.start : 0))
      mdPushInline(state, item.inline)
    })
    return
  }
  if (block.type === 'code') {
    if (typeof block.text === 'string' && block.text.length > 0) {
      const base = Number.isFinite(block.textStart)
        ? block.textStart
        : Number.isFinite(block.start) ? block.start : 0
      mdPushRun(state, block.text, (index) => base + index)
    }
    return
  }
  if (block.type === 'table') {
    const rows = []
    if (Array.isArray(block.header)) rows.push(block.header)
    if (Array.isArray(block.rows)) {
      for (const row of block.rows) rows.push(row)
    }
    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return
      if (rowIndex > 0) {
        const offset = mdInlineStart(row[0], block.start)
        mdPushRun(state, '\n', () => offset)
      }
      row.forEach((cell, cellIndex) => {
        if (cellIndex > 0) {
          const offset = mdInlineStart(cell, block.start)
          mdPushRun(state, '\t', () => offset)
        }
        mdPushInline(state, cell)
      })
    })
    return
  }
  if (block.type === 'quote') {
    const children = Array.isArray(block.blocks) ? block.blocks : []
    let first = true
    for (const child of children) {
      if (!child || typeof child !== 'object') continue
      if (!first) mdPushRun(state, '\n', () => (Number.isFinite(child.start) ? child.start : 0))
      first = false
      child.plainStart = state.text.length
      mdProjectBlock(child, state)
      child.plainEnd = state.text.length
    }
  }
}

/**
 * Flatten parsed blocks into the plain text a reader selects from.
 * `map[i]` is the source offset of `text[i]` and is non-decreasing.
 * Block objects get `plainStart`/`plainEnd` written back in place.
 * @param {object[]} blocks
 * @returns {{ text: string, map: number[] }}
 */
function plainProjection(blocks) {
  const state = { text: '', map: [] }
  const list = Array.isArray(blocks) ? blocks : []
  for (const block of list) {
    if (!block || typeof block !== 'object') continue
    const start = Number.isFinite(block.start) ? block.start : 0
    if (state.text.length > 0) mdPushRun(state, '\n', () => start)
    block.plainStart = state.text.length
    mdProjectBlock(block, state)
    block.plainEnd = state.text.length
  }
  return { text: state.text, map: state.map }
}

// Collapse whitespace runs into one space and remember where every remaining
// character came from, so quote matching survives re-wrapped text.
function mdNormalizeWhitespace(value) {
  const text = typeof value === 'string' ? value : ''
  const chars = []
  const index = []
  let previousSpace = false
  for (let position = 0; position < text.length; position += 1) {
    const char = text[position]
    if (MD_WS_RE.test(char)) {
      if (!previousSpace) {
        chars.push(' ')
        index.push(position)
        previousSpace = true
      }
    } else {
      chars.push(char)
      index.push(position)
      previousSpace = false
    }
  }
  let from = 0
  let to = chars.length
  while (from < to && chars[from] === ' ') from += 1
  while (to > from && chars[to - 1] === ' ') to -= 1
  return { text: chars.slice(from, to).join(''), index: index.slice(from, to) }
}

function mdPlainPositionForSource(projection, sourceOffset) {
  if (!Number.isFinite(sourceOffset)) return -1
  const map = projection.map
  let low = 0
  let high = map.length - 1
  let found = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (map[middle] >= sourceOffset) {
      found = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }
  return found
}

/**
 * Find `quote` inside the projection, preferring prefix/suffix context and then
 * the candidate closest to the stored source offset.
 * @returns {{plainStart:number, plainEnd:number, start:number, end:number, exact:boolean}|null}
 */
function locateQuote(projection, selection) {
  if (!projection || typeof projection.text !== 'string' || !Array.isArray(projection.map)) return null
  const request = selection && typeof selection === 'object' ? selection : {}
  const needle = mdNormalizeWhitespace(request.quote)
  if (!needle.text) return null
  const haystack = mdNormalizeWhitespace(projection.text)
  const matches = []
  let from = 0
  while (from <= haystack.text.length) {
    const at = haystack.text.indexOf(needle.text, from)
    if (at === -1) break
    matches.push(at)
    from = at + 1
  }
  if (matches.length === 0) return null
  const prefix = mdNormalizeWhitespace(request.prefix)
  const suffix = mdNormalizeWhitespace(request.suffix)
  const target = mdPlainPositionForSource(projection, request.start)
  let best = null
  for (const at of matches) {
    // Slice one extra character on each side: whitespace runs in the haystack
    // are single spaces, while the stored context may end with a space that
    // normalisation trimmed away.
    const before = haystack.text.slice(Math.max(0, at - prefix.text.length - 1), at).replace(/ $/, '')
    const after = haystack.text.slice(at + needle.text.length, at + needle.text.length + suffix.text.length + 1).replace(/^ /, '')
    const prefixOk = prefix.text.length > 0 && before.endsWith(prefix.text)
    const suffixOk = suffix.text.length > 0 && after.startsWith(suffix.text)
    const candidate = {
      plainStart: haystack.index[at],
      plainEnd: haystack.index[at + needle.text.length - 1] + 1,
      score: (prefixOk ? 2 : 0) + (suffixOk ? 1 : 0),
      distance: target >= 0 ? Math.abs(haystack.index[at] - target) : 0,
    }
    if (!best || candidate.score > best.score
      || (candidate.score === best.score && candidate.distance < best.distance)) {
      best = candidate
    }
  }
  const mapped = mapPlainToSource(projection, best.plainStart, best.plainEnd)
  if (!mapped) return null
  return {
    plainStart: best.plainStart,
    plainEnd: best.plainEnd,
    start: mapped.start,
    end: mapped.end,
    exact: matches.length === 1,
  }
}

/**
 * Translate a plain-text range into source offsets. Leading/trailing
 * whitespace of the range is dropped; illegal ranges return null.
 * @returns {{start:number, end:number}|null}
 */
function mapPlainToSource(projection, plainStart, plainEnd) {
  if (!projection || typeof projection.text !== 'string' || !Array.isArray(projection.map)) return null
  const length = projection.text.length
  if (!Number.isFinite(plainStart) || !Number.isFinite(plainEnd)) return null
  let from = Math.trunc(plainStart)
  let to = Math.trunc(plainEnd)
  if (from < 0 || to > length || from >= to) return null
  while (from < to && MD_WS_RE.test(projection.text[from])) from += 1
  while (to > from && MD_WS_RE.test(projection.text[to - 1])) to -= 1
  if (from >= to) return null
  const start = projection.map[from]
  const end = projection.map[to - 1] + 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { start, end }
}

/**
 * Apply non-overlapping replacements. Replacements are spliced from the end of
 * the text backwards; the ones that overlap an already applied range are
 * reported as skipped (invalid entries are skipped as well).
 * @returns {{text:string, applied:object[], skipped:object[]}}
 */
function applyReplacements(source, replacements) {
  const text = typeof source === 'string' ? source : ''
  const list = Array.isArray(replacements) ? replacements : []
  const candidates = []
  const skipped = []
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      if (item && typeof item === 'object') skipped.push(item)
      continue
    }
    const start = Number(item.start)
    const end = Number(item.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      skipped.push(item)
      continue
    }
    const from = Math.trunc(start)
    const to = Math.trunc(end)
    if (from < 0 || to < from || to > text.length) {
      skipped.push(item)
      continue
    }
    candidates.push({
      item,
      start: from,
      end: to,
      replacement: typeof item.replacement === 'string' ? item.replacement : '',
    })
  }
  candidates.sort((left, right) => (right.start - left.start) || (right.end - left.end))
  const applied = []
  let output = text
  let boundary = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (candidate.end > boundary) {
      skipped.push(candidate.item)
      continue
    }
    output = output.slice(0, candidate.start) + candidate.replacement + output.slice(candidate.end)
    applied.push(candidate.item)
    boundary = candidate.start
  }
  return { text: output, applied, skipped }
}

/**
 * Find `[[FIGURE: p.7 | caption | hint]]` placeholders. `start`/`end` cover the
 * whole line including its trailing newline; `line` is the 1-based line number.
 * @returns {{index:number,start:number,end:number,line:number,page:number,caption:string,hint:string}[]}
 */
function findFigurePlaceholders(source) {
  const text = typeof source === 'string' ? source : ''
  const found = []
  let position = 0
  let lineNumber = 0
  while (position <= text.length) {
    const newline = text.indexOf('\n', position)
    const lineEnd = newline === -1 ? text.length : newline
    let lineText = text.slice(position, lineEnd)
    if (lineText.endsWith('\r')) lineText = lineText.slice(0, -1)
    lineNumber += 1
    const match = MD_FIGURE_LINE_RE.exec(lineText)
    if (match) {
      const fields = match[1].split('|')
      const pageMatch = MD_FIGURE_PAGE_RE.exec((fields[0] || '').trim())
      const page = pageMatch ? Number.parseInt(pageMatch[1], 10) : 0
      if (Number.isFinite(page) && page > 0) {
        found.push({
          index: found.length,
          start: position,
          end: newline === -1 ? lineEnd : newline + 1,
          line: lineNumber,
          page,
          caption: mdClip((fields[1] || '').trim(), 200),
          hint: mdClip(fields.slice(2).join('|').trim(), 400),
        })
      }
    }
    if (newline === -1) break
    position = newline + 1
  }
  return found
}
// #endregion markdown-core

    const ICON = {
      book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
      folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
      sparkle: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z',
      close: 'M18 6L6 18 M6 6l12 12',
      plus: 'M12 5v14 M5 12h14',
      minus: 'M5 12h14',
      chevronLeft: 'M15 18l-6-6 6-6',
      chevronRight: 'M9 18l6-6-6-6',
      pen: 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z M2 2l7.586 7.586',
      eraser: 'M20 20H9L4 15a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20',
      undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
      select: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3',
      hand: 'M18 11V6a2 2 0 0 0-4 0v5 M14 10V4a2 2 0 0 0-4 0v6 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
      note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
      trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 15H6L5 6 M10 11v6 M14 11v6',
      search: 'M21 21l-4.35-4.35 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
      arrowUp: 'M12 19V5 M5 12l7-7 7 7',
      quote: 'M6 17h3l2-4V7H5v6h3z M16 17h3l2-4V7h-5v6h3z',
      expand: 'M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3',
      collapse: 'M8 3v3a2 2 0 0 1-2 2H3 M21 8h-3a2 2 0 0 1-2-2V3 M3 16h3a2 2 0 0 1 2 2v3 M16 21v-3a2 2 0 0 1 2-2h3',
      check: 'M20 6L9 17l-5-5',
      refresh: 'M23 4v6h-6 M1 20v-6h6 M3.5 9a9 9 0 0 1 14.9-3.4L23 10 M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
      list: 'M4 6h2 M4 12h2 M4 18h2 M9 6h11 M9 12h11 M9 18h11',
      grip: 'M9 5h.01 M15 5h.01 M9 12h.01 M15 12h.01 M9 19h.01 M15 19h.01',
      target: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z M12 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
    }

    function Icon({ name, size = 16, className = '' }) {
      return h(
        'svg',
        {
          className: `lr-icon ${className}`,
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: ICON[name] || ICON.book }),
      )
    }

    function PanelIcon({ size = 20 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 64 64',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', { x: 5, y: 7, width: 54, height: 50, rx: 12, fill: 'currentColor', opacity: 0.12 }),
        h('path', {
          d: 'M17 18c6-2.4 11.7-1.7 15 2.1 3.3-3.8 9-4.5 15-2.1v28.2c-6-2.2-11.7-1.5-15 2.3-3.3-3.8-9-4.5-15-2.3z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 3.6,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M32 20v28', stroke: 'currentColor', strokeWidth: 3.2, opacity: 0.5 }),
      )
    }

    // ── fullscreen ────────────────────────────────────────────────────────
    // The reader lives inside the Harness main column. Fullscreening the page
    // root (instead of this subtree) keeps the host's wallpaper and overlay
    // widgets, notably the weather pill, on screen; the reader still gets the
    // whole width because the sidebar is collapsed for the mode and CSS zeroes
    // the reserved Windows caption strip. These helpers stay at module scope so
    // they can be tested without a DOM and so the same fallback serves
    // Safari/Electron spellings.
    function fullscreenElement() {
      if (typeof document === 'undefined') return null
      return document.fullscreenElement || document.webkitFullscreenElement || null
    }

    // The layout frame carries data-sidebar-collapsed while the host sidebar is
    // closed. Reading that marker lets the mode collapse the sidebar only when
    // it is actually open, and restore only what it changed. null means this is
    // not the Harness shell (or the shell is not mounted), so leave it alone.
    function hostLayoutFrame() {
      if (typeof document === 'undefined') return null
      const overlay = document.querySelector('[data-shell-overlay]')
      return overlay ? overlay.parentElement : null
    }

    function hostSidebarCollapsed() {
      const frame = hostLayoutFrame()
      return frame ? frame.hasAttribute('data-sidebar-collapsed') : null
    }

    function enterFullscreen(node) {
      if (!node) return Promise.resolve(false)
      const request = node.requestFullscreen || node.webkitRequestFullscreen
      if (typeof request !== 'function') return Promise.resolve(false)
      try {
        return Promise.resolve(request.call(node)).then(
          () => true,
          () => false,
        )
      } catch {
        return Promise.resolve(false)
      }
    }

    function exitFullscreen() {
      if (typeof document === 'undefined') return Promise.resolve(false)
      const exit = document.exitFullscreen || document.webkitExitFullscreen
      if (typeof exit !== 'function') return Promise.resolve(false)
      try {
        return Promise.resolve(exit.call(document)).then(
          () => true,
          () => false,
        )
      } catch {
        return Promise.resolve(false)
      }
    }

    function FullscreenButton({ active, onClick }) {
      const label = active ? t('exitFullscreen') : t('fullscreen')
      return h(
        'button',
        {
          type: 'button',
          className: `lr-tool lr-fullscreen-tool${active ? ' active' : ''}`,
          onClick,
          title: label,
          'aria-label': label,
          'aria-pressed': active ? 'true' : 'false',
        },
        h(Icon, { name: active ? 'collapse' : 'expand', size: 14 }),
        h('span', null, label),
      )
    }

    async function request(path, options = {}) {
      const response = await fetch(`${API}${path}`, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = {}
      }
      if (!response.ok) {
        const error = new Error(payload.error || `HTTP ${response.status}`)
        error.status = response.status
        throw error
      }
      return payload
    }

    async function streamSse(path, body, onEvent, signal) {
      const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal,
      })
      if (!response.ok) {
        let payload = {}
        try {
          payload = await response.json()
        } catch {
          // ignore
        }
        throw new Error(payload.error || `HTTP ${response.status}`)
      }
      if (!response.body) throw new Error('浏览器不支持流式响应')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const dataLines = block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
          if (dataLines.length > 0) {
            let event
            try {
              event = JSON.parse(dataLines.join('\n'))
            } catch {
              event = undefined
            }
            if (event) {
              if (event.type === 'error') throw new Error(event.message || 'AI 生成失败')
              onEvent(event)
            }
          }
          boundary = buffer.indexOf('\n\n')
        }
      }
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
      }
      return btoa(binary)
    }

    function pageCountLabel(paper) {
      return `${paper?.pageCount || 0} ${t('pagesUnit')}`
    }

    function storedNumber(key, fallback, min, max) {
      try {
        const value = Number(localStorage.getItem(key))
        if (Number.isFinite(value) && value >= min && value <= max) return value
      } catch {
        // ignore storage failures
      }
      return fallback
    }

    function safeError(error) {
      if (!error) return ''
      if (error.name === 'AbortError') return ''
      return error.message || String(error)
    }

    function renderInline(text, onCite, keyPrefix = 'i') {
      const nodes = []
      const source = String(text || '')
      const pattern =
        /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\[p{1,2}\.\s*\d+(?:\s*[-–]\s*\d+)?\])/g
      let last = 0
      let match
      let index = 0
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > last) nodes.push(source.slice(last, match.index))
        const token = match[0]
        const key = `${keyPrefix}-${index}`
        index += 1
        if (token.startsWith('**') && token.endsWith('**')) {
          nodes.push(h('strong', { key }, token.slice(2, -2)))
        } else if (token.startsWith('`') && token.endsWith('`')) {
          nodes.push(h('code', { key, className: 'lr-inline-code' }, token.slice(1, -1)))
        } else if (token.startsWith('[') && token.includes('](')) {
          const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
          if (link) {
            nodes.push(
              h(
                'a',
                { key, href: link[2], target: '_blank', rel: 'noreferrer noopener' },
                link[1],
              ),
            )
          } else {
            nodes.push(token)
          }
        } else {
          const cite = token.match(/^\[p{1,2}\.\s*(\d+)/i)
          if (cite) {
            const page = Number(cite[1])
            nodes.push(
              h(
                'button',
                {
                  key,
                  type: 'button',
                  className: 'lr-cite',
                  title: t('citationJump').replace('{page}', String(page)),
                  onClick: () => onCite?.(page),
                },
                token,
              ),
            )
          } else {
            nodes.push(token)
          }
        }
        last = match.index + token.length
      }
      if (last < source.length) nodes.push(source.slice(last))
      return nodes.length > 0 ? nodes : ['']
    }

    function markdownBlocks(text, onCite) {
      const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
      const blocks = []
      let index = 0
      let key = 0
      const nextKey = () => `md-${key++}`
      const isBlockStart = (line) =>
        /^```/.test(line) ||
        /^#{1,4}\s+/.test(line) ||
        /^\s*([-*+]|\d+\.)\s+/.test(line) ||
        /^>\s?/.test(line) ||
        /^\|.*\|$/.test(line) ||
        /^\s*---+\s*$/.test(line)
      while (index < lines.length) {
        const line = lines[index]
        if (!line.trim()) {
          index += 1
          continue
        }
        if (/^```/.test(line)) {
          const language = line.slice(3).trim()
          const code = []
          index += 1
          while (index < lines.length && !/^```/.test(lines[index])) {
            code.push(lines[index])
            index += 1
          }
          index += 1
          blocks.push(
            h(
              'pre',
              { key: nextKey(), className: 'lr-pre' },
              h('code', { 'data-language': language || undefined }, code.join('\n')),
            ),
          )
          continue
        }
        const heading = line.match(/^(#{1,4})\s+(.*)$/)
        if (heading) {
          const level = Math.min(4, heading[1].length)
          blocks.push(
            h(
              `h${level + 2}`,
              { key: nextKey(), className: `lr-md-h lr-md-h${level}` },
              ...renderInline(heading[2], onCite, nextKey()),
            ),
          )
          index += 1
          continue
        }
        if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
          const ordered = /^\s*\d+\.\s+/.test(line)
          const items = []
          while (index < lines.length) {
            const item = lines[index]
            const match = ordered
              ? item.match(/^\s*\d+\.\s+(.*)$/)
              : item.match(/^\s*[-*+]\s+(.*)$/)
            if (!match) break
            items.push(match[1])
            index += 1
          }
          blocks.push(
            h(
              ordered ? 'ol' : 'ul',
              { key: nextKey(), className: 'lr-md-list' },
              items.map((item, itemIndex) =>
                h('li', { key: `${itemIndex}` }, ...renderInline(item, onCite, `${nextKey()}-${itemIndex}`)),
              ),
            ),
          )
          continue
        }
        if (/^>\s?/.test(line)) {
          const quote = []
          while (index < lines.length && /^>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^>\s?/, ''))
            index += 1
          }
          blocks.push(
            h(
              'blockquote',
              { key: nextKey(), className: 'lr-md-quote' },
              ...renderInline(quote.join(' '), onCite, nextKey()),
            ),
          )
          continue
        }
        if (/^\|.*\|$/.test(line) && index + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[index + 1])) {
          const headerCells = line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim())
          index += 2
          const rows = []
          while (index < lines.length && /^\|.*\|$/.test(lines[index])) {
            const cells = lines[index]
              .trim()
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((cell) => cell.trim())
            rows.push(cells)
            index += 1
          }
          blocks.push(
            h(
              'div',
              { key: nextKey(), className: 'lr-table-wrap' },
              h(
                'table',
                { className: 'lr-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    headerCells.map((cell, cellIndex) =>
                      h('th', { key: `${cellIndex}` }, ...renderInline(cell, onCite, `${nextKey()}-h${cellIndex}`)),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  rows.map((row, rowIndex) =>
                    h(
                      'tr',
                      { key: `${rowIndex}` },
                      row.map((cell, cellIndex) =>
                        h('td', { key: `${cellIndex}` }, ...renderInline(cell, onCite, `${nextKey()}-r${rowIndex}c${cellIndex}`)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
          continue
        }
        if (/^\s*---+\s*$/.test(line)) {
          blocks.push(h('hr', { key: nextKey(), className: 'lr-md-hr' }))
          index += 1
          continue
        }
        const paragraph = [line.trim()]
        index += 1
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
          paragraph.push(lines[index].trim())
          index += 1
        }
        blocks.push(
          h(
            'p',
            { key: nextKey(), className: 'lr-md-p' },
            ...renderInline(paragraph.join(' '), onCite, nextKey()),
          ),
        )
      }
      return blocks
    }

    function Markdown({ text, onCite, className = '' }) {
      return h('div', { className: `lr-md ${className}` }, ...markdownBlocks(text, onCite))
    }

    function Spinner({ size = 14 }) {
      return h('span', { className: 'lr-spinner', style: { width: size, height: size }, 'aria-hidden': true })
    }

    function Modal({ title, subtitle, onClose, children, wide = false, elevated = false }) {
      const closeRef = useRef(null)
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const timer = setTimeout(() => closeRef.current?.focus(), 30)
        return () => {
          window.removeEventListener('keydown', onKey)
          document.body.style.overflow = previous
          clearTimeout(timer)
        }
      }, [onClose])
      return h(
        'div',
        {
          className: `lr-modal-backdrop${elevated ? ' elevated' : ''}`,
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose?.()
          },
        },
        h(
          'div',
          {
            className: `lr-modal ${wide ? 'wide' : ''}`,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
          },
          h(
            'div',
            { className: 'lr-modal-head' },
            h(
              'div',
              { className: 'lr-modal-titles' },
              h('div', { className: 'lr-modal-title' }, title),
              subtitle ? h('div', { className: 'lr-modal-subtitle' }, subtitle) : null,
            ),
            h(
              'button',
              {
                ref: closeRef,
                type: 'button',
                className: 'lr-btn icon',
                onClick: onClose,
                'aria-label': t('close'),
              },
              h(Icon, { name: 'close' }),
            ),
          ),
          h('div', { className: 'lr-modal-body' }, children),
        ),
      )
    }

    function PageView({
      n,
      url,
      strokes,
      selection,
      bubbleVisible,
      mode,
      penColor,
      penWidth,
      eraserWidth,
      onSelect,
      onStroke,
      onErase,
      onQuickSelection,
      onUseSelection,
      onClearSelection,
      registerRef,
    }) {
      const imageRef = useRef(null)
      const [drag, setDrag] = useState(null)
      const [draft, setDraft] = useState(null)
      const [loaded, setLoaded] = useState(false)
      const erasingRef = useRef(false)
      const draftRef = useRef(null)

      const pageStrokes = useMemo(
        () => (Array.isArray(strokes) ? strokes.filter((stroke) => stroke.page === n) : EMPTY),
        [strokes, n],
      )

      function pointFromEvent(event) {
        const image = imageRef.current
        if (!image) return { x: 0, y: 0 }
        const rect = image.getBoundingClientRect()
        return {
          x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
        }
      }

      function down(event) {
        // In pan mode the viewer scroll handler owns the gesture: leave the
        // event untouched so it bubbles up without selecting text or drawing.
        if (mode === 'pan') return
        if (event.button !== 0 || !loaded) return
        if (event.target.closest?.('.lr-bubble')) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        const point = pointFromEvent(event)
        if (mode === 'select') {
          setDrag({ x0: point.x, y0: point.y, x1: point.x, y1: point.y })
        } else if (mode === 'pen') {
          const next = [point]
          draftRef.current = next
          setDraft(next)
        } else if (mode === 'eraser') {
          erasingRef.current = true
          onErase?.(n, point, {
            width: imageRef.current?.clientWidth || 1,
            height: imageRef.current?.clientHeight || 1,
          }, eraserWidth)
        }
      }

      function move(event) {
        if (!loaded) return
        if (drag) {
          const point = pointFromEvent(event)
          setDrag((current) => (current ? { ...current, x1: point.x, y1: point.y } : current))
          return
        }
        if (draftRef.current) {
          const point = pointFromEvent(event)
          const last = draftRef.current[draftRef.current.length - 1]
          if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.0018) {
            const next = [...draftRef.current, point]
            draftRef.current = next
            setDraft(next)
          }
          return
        }
        if (erasingRef.current) {
          const point = pointFromEvent(event)
          onErase?.(n, point, {
            width: imageRef.current?.clientWidth || 1,
            height: imageRef.current?.clientHeight || 1,
          }, eraserWidth)
        }
      }

      function up(event) {
        if (drag) {
          const rect = {
            x: Math.min(drag.x0, drag.x1),
            y: Math.min(drag.y0, drag.y1),
            w: Math.abs(drag.x1 - drag.x0),
            h: Math.abs(drag.y1 - drag.y0),
          }
          setDrag(null)
          if (rect.w > 0.012 && rect.h > 0.006) {
            const image = imageRef.current
            if (image && image.naturalWidth > 0) {
              const sx = rect.x * image.naturalWidth
              const sy = rect.y * image.naturalHeight
              const sw = Math.max(1, rect.w * image.naturalWidth)
              const sh = Math.max(1, rect.h * image.naturalHeight)
              const scale = Math.min(1, 2400 / Math.max(sw, sh))
              const canvas = document.createElement('canvas')
              canvas.width = Math.max(1, Math.round(sw * scale))
              canvas.height = Math.max(1, Math.round(sh * scale))
              const context = canvas.getContext('2d')
              if (context) {
                context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
                const imageData = canvas.toDataURL('image/jpeg', 0.9)
                onSelect?.({ page: n, rect, imageData })
              }
            }
          }
          return
        }
        if (draftRef.current) {
          const points = draftRef.current
          draftRef.current = null
          setDraft(null)
          if (points.length >= 2) {
            onStroke?.({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              page: n,
              color: penColor,
              width: penWidth,
              opacity: penColor === '#f6c945' ? 0.35 : 1,
              points: points.map((point) => [
                Number(point.x.toFixed(5)),
                Number(point.y.toFixed(5)),
              ]),
            })
          }
          return
        }
        erasingRef.current = false
      }

      const selected = selection && selection.page === n ? selection : null
      const selectedRect = selected?.rect
      const showBubble = Boolean(selectedRect) && bubbleVisible !== false
      const bubbleStyle = selectedRect
        ? {
            left: `${Math.min(78, Math.max(1, selectedRect.x * 100))}%`,
            top: `${Math.max(0.5, selectedRect.y * 100)}%`,
            transform: selectedRect.y < 0.09 ? 'translateY(10px)' : 'translateY(calc(-100% - 8px))',
          }
        : undefined

      return h(
        'div',
        { className: 'lr-page', ref: (node) => registerRef?.(n, node), 'data-lr-page': n },
        h('div', { className: 'lr-page-no' }, `${t('pageContext').replace('{page}', String(n))}`),
        h(
          'div',
          {
            className: `lr-page-paper mode-${mode} ${loaded ? 'loaded' : 'loading'}`,
            onPointerDown: down,
            onPointerMove: move,
            onPointerUp: up,
            onPointerCancel: up,
          },
          h('img', {
            ref: imageRef,
            src: url,
            alt: `${t('pageContext').replace('{page}', String(n))}`,
            draggable: false,
            loading: n <= 2 ? 'eager' : 'lazy',
            decoding: 'async',
            onLoad: () => setLoaded(true),
            onError: () => setLoaded(true),
          }),
          h(
            'svg',
            {
              className: 'lr-anno-layer',
              viewBox: '0 0 1 1',
              preserveAspectRatio: 'none',
              'aria-hidden': true,
            },
            pageStrokes.map((stroke) =>
              h('polyline', {
                key: stroke.id,
                points: stroke.points.map((point) => `${point[0]},${point[1]}`).join(' '),
                fill: 'none',
                stroke: stroke.color,
                strokeWidth: stroke.width,
                strokeOpacity: stroke.opacity,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                vectorEffect: 'non-scaling-stroke',
              }),
            ),
            draft
              ? h('polyline', {
                  points: draft.map((point) => `${point.x},${point.y}`).join(' '),
                  fill: 'none',
                  stroke: penColor,
                  strokeWidth: penWidth,
                  strokeOpacity: penColor === '#f6c945' ? 0.35 : 1,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  vectorEffect: 'non-scaling-stroke',
                })
              : null,
          ),
          drag
            ? h('div', {
                className: 'lr-select-box',
                style: {
                  left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                  top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                  width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                  height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                },
              })
            : selectedRect
              ? h('div', {
                  className: 'lr-select-box persistent',
                  style: {
                    left: `${selectedRect.x * 100}%`,
                    top: `${selectedRect.y * 100}%`,
                    width: `${selectedRect.w * 100}%`,
                    height: `${selectedRect.h * 100}%`,
                  },
                })
              : null,
          showBubble
            ? h(
                'div',
                {
                  className: 'lr-bubble',
                  style: bubbleStyle,
                  onPointerDown: (event) => event.stopPropagation(),
                  onMouseDown: (event) => event.stopPropagation(),
                },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-bubble-btn',
                    onClick: () => onQuickSelection('translate'),
                  },
                  t('translate'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-bubble-btn',
                    onClick: () => onQuickSelection('explain'),
                  },
                  t('explain'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-bubble-btn primary',
                    onClick: () => onUseSelection(),
                  },
                  t('selectionAsk'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-bubble-close',
                    onClick: () => onClearSelection(),
                    'aria-label': t('clearSelection'),
                  },
                  h(Icon, { name: 'close', size: 12 }),
                ),
              )
            : null,
          !loaded ? h('div', { className: 'lr-page-loading' }, h(Spinner, { size: 18 })) : null,
        ),
      )
    }

    const MemoPageView = React.memo(PageView)

    function ChatMessage({ message, onCite, onExpand }) {
      const isUser = message.role === 'user'
      const isExtract = message.kind === 'extract'
      return h(
        'div',
        { className: `lr-msg ${isUser ? 'user' : 'assistant'} ${message.error ? 'error' : ''}` },
        h(
          'div',
          { className: 'lr-msg-meta' },
          isUser ? null : h('span', { className: 'lr-msg-avatar' }, 'AI'),
          h(
            'span',
            { className: 'lr-msg-role' },
            isUser
              ? ''
              : isExtract
                ? `${t('extract')} · ${message.chapter?.title || ''}`
                : t('aiReader'),
          ),
          isExtract && !isUser
            ? h(
                'button',
                { type: 'button', className: 'lr-mini-action', onClick: () => onExpand(message) },
                h(Icon, { name: 'expand', size: 11 }),
                t('expand'),
              )
            : null,
        ),
        h(
          'div',
          { className: `lr-msg-body ${isUser ? 'user-bubble' : ''}` },
          message.selection?.imageUrl
            ? h('img', {
                className: 'lr-sel-thumb',
                src: message.selection.imageUrl,
                alt: t('selectionExists'),
              })
            : null,
          isUser
            ? h('div', { className: 'lr-user-text' }, message.content)
            : h(Markdown, { text: message.content, onCite }),
          !isUser && isExtract && message.chapter
            ? h(
                'div',
                { className: 'lr-msg-foot' },
                `${t('pageContext').replace('{page}', `${message.chapter.start}-${message.chapter.end}`)}`,
              )
            : null,
        ),
      )
    }

    function Toast({ toast }) {
      if (!toast) return null
      return h(
        'div',
        { className: `lr-toast ${toast.kind || ''}`, role: 'status' },
        h(Icon, { name: toast.kind === 'error' ? 'close' : 'check', size: 14 }),
        h('span', null, toast.message),
      )
    }

    // Model and thinking-effort picker. It lives in the chat header so the
    // current route is visible while reading; every choice is saved on the
    // host so the next session starts from the same route.
    function ModelPicker({
      open,
      health,
      groups,
      loading,
      error,
      busy,
      onClose,
      onSelect,
      onEffort,
    }) {
      const panelRef = useRef(null)
      useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') onClose?.()
        }
        const onDown = (event) => {
          const node = panelRef.current
          if (node && !node.contains(event.target)) onClose?.()
        }
        window.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onDown, true)
        return () => {
          window.removeEventListener('keydown', onKey)
          document.removeEventListener('mousedown', onDown, true)
        }
      }, [open, onClose])
      if (!open) return null

      const selection = health?.selection || {
        provider: health?.provider || '',
        model: health?.modelId || '',
      }
      const efforts = Array.isArray(health?.effortLabels)
        ? health.effortLabels
        : (health?.reasoningEfforts || []).map((id) => ({ id, name: id }))
      const activeEffort = health?.activeEffort || ''
      const chosen = health?.preference?.reasoningEffort || ''

      return h(
        'div',
        { className: 'lr-model-pop', ref: panelRef, role: 'dialog', 'aria-label': t('modelPickerTitle') },
        h(
          'div',
          { className: 'lr-model-pop-head' },
          h('span', { className: 'lr-model-pop-title' }, t('modelPickerTitle')),
          h(
            'button',
            { type: 'button', className: 'lr-btn icon small', onClick: onClose, 'aria-label': t('close') },
            h(Icon, { name: 'close', size: 12 }),
          ),
        ),
        h('div', { className: 'lr-model-pop-sub' }, t('modelPickerSubtitle')),
        h(
          'div',
          { className: 'lr-model-pop-body' },
          loading
            ? h('div', { className: 'lr-model-pop-empty' }, t('modelLoading'))
            : error
              ? h('div', { className: 'lr-model-pop-empty error' }, error)
              : groups.length === 0
                ? h(
                    'div',
                    { className: 'lr-model-pop-empty' },
                    h('div', null, t('noModels')),
                    h('div', { className: 'lr-model-pop-hint' }, t('noModelsHint')),
                  )
                : groups.map((group) =>
                    h(
                      'div',
                      { className: 'lr-model-group', key: group.provider },
                      h('div', { className: 'lr-model-group-name' }, group.name || group.provider),
                      group.models.map((model) => {
                        const current =
                          selection.provider === group.provider && selection.model === model.id
                        const noImage =
                          Array.isArray(model.inputModalities) &&
                          model.inputModalities.length > 0 &&
                          !model.inputModalities.includes('image')
                        return h(
                          'button',
                          {
                            type: 'button',
                            key: `${group.provider}/${model.id}`,
                            className: `lr-model-row${current ? ' active' : ''}`,
                            disabled: busy,
                            onClick: () => onSelect({ provider: group.provider, model: model.id }),
                            title: noImage ? t('modelNoImageHint') : model.description || model.name,
                          },
                          h(Icon, { name: current ? 'check' : 'sparkle', size: 13 }),
                          h(
                            'span',
                            { className: 'lr-model-name' },
                            model.name || model.id,
                          ),
                          noImage
                            ? h('span', { className: 'lr-model-flag warn' }, t('modelNoImage'))
                            : h('span', { className: 'lr-model-flag' }, t('modelImagesOk')),
                        )
                      }),
                    ),
                  ),
        ),
        efforts.length > 0
          ? h(
              'div',
              { className: 'lr-model-pop-foot' },
              h(
                'div',
                { className: 'lr-effort-head' },
                h('span', null, t('effortSection')),
                activeEffort
                  ? h(
                      'span',
                      { className: 'lr-effort-active' },
                      efforts.find((item) => item.id === activeEffort)?.name || activeEffort,
                    )
                  : null,
              ),
              h(
                'div',
                { className: 'lr-effort-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: `lr-effort${chosen === '' ? ' active' : ''}`,
                    disabled: busy,
                    onClick: () => onEffort(''),
                    title: t('effortAutoDesc'),
                  },
                  t('effortAuto'),
                ),
                efforts.map((effort) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      key: effort.id,
                      className: `lr-effort${chosen === effort.id ? ' active' : ''}`,
                      disabled: busy,
                      title: effort.description || effort.name,
                      onClick: () => onEffort(effort.id),
                    },
                    effort.name || effort.id,
                  ),
                ),
              ),
            )
          : h('div', { className: 'lr-model-pop-foot muted' }, t('effortUnsupported')),
      )
    }

    function ProgressCard({ paper, onRetry, retrying }) {
      if (!paper) return null
      const progress = paper.progress
      const total = Number(progress?.total || 1)
      const done = Number(progress?.done || 0)
      const percent = total > 0 ? Math.max(6, Math.min(100, (done / total) * 100)) : 0
      const failed = paper.status === 'error'
      return h(
        'div',
        { className: `lr-progress-card ${failed ? 'failed' : ''}` },
        h(
          'div',
          { className: 'lr-progress-head' },
          h(
            'span',
            { className: 'lr-progress-icon' },
            failed ? h(Icon, { name: 'refresh', size: 15 }) : h(Icon, { name: 'sparkle', size: 15 }),
          ),
          h(
            'div',
            { className: 'lr-progress-copy' },
            h(
              'div',
              { className: 'lr-progress-title' },
              failed ? paper.error || t('loadFailed') : progress?.label || t('reading'),
            ),
            h('div', { className: 'lr-progress-sub' }, failed ? t('retryRead') : t('readingHint')),
          ),
          failed
            ? h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: onRetry, disabled: retrying },
                retrying ? h(Spinner, { size: 12 }) : h(Icon, { name: 'refresh', size: 13 }),
                t('retry'),
              )
            : total > 1
              ? h('span', { className: 'lr-progress-pct' }, `${Math.round(percent)}%`)
              : null,
        ),
        !failed
          ? h(
              'div',
              { className: 'lr-progress-track' },
              h('div', {
                className: `lr-progress-fill ${total <= 1 ? 'indeterminate' : ''}`,
                style: total > 1 ? { width: `${percent}%` } : undefined,
              }),
            )
          : null,
        !failed && paper.scanned && paper.ocrTotal > 0
          ? h('div', { className: 'lr-progress-note' }, `OCR ${paper.ocrDone}/${paper.ocrTotal}`)
          : null,
      )
    }

    function OverviewCard({
      paper,
      onAnalysis,
      onSummary,
      summaryRunning,
      onOpenNote,
      onPreview,
      onStudyNote,
    }) {
      const [expanded, setExpanded] = useState(false)
      if (!paper) return null
      const hasAnalysis = Boolean(paper.analysisReady)
      const warning = paper.analysisError
      const hasSummary = Boolean(paper.hasSummary)
      const digest = paper.tldr || paper.abstract || ''
      return h(
        'section',
        { className: 'lr-overview' },
        h(
          'div',
          { className: 'lr-overview-head' },
          h('span', { className: 'lr-overview-icon' }, h(Icon, { name: 'book', size: 15 })),
          h('span', { className: 'lr-overview-title' }, t('readingDigest')),
          hasSummary ? h('span', { className: 'lr-overview-flag' }, t('summaryReady')) : null,
          hasAnalysis
            ? h(
                'button',
                { type: 'button', className: 'lr-mini-action solid', onClick: onAnalysis },
                h(Icon, { name: 'expand', size: 11 }),
                t('analysisOpen'),
              )
            : h('span', { className: 'lr-overview-flag warn' }, t('analysisWarning')),
        ),
        h(
          'div',
          { className: `lr-overview-text ${expanded ? 'expanded' : ''}` },
          hasAnalysis ? digest || t('analysisMissing') : warning || t('analysisMissing'),
        ),
        hasAnalysis && digest
          ? h(
              'button',
              {
                type: 'button',
                className: `lr-overview-toggle ${expanded ? 'expanded' : ''}`,
                onClick: () => setExpanded((value) => !value),
              },
              expanded ? t('collapse') : t('expand'),
              h(Icon, { name: 'chevronRight', size: 11 }),
            )
          : null,
        paper.tags?.length
          ? h(
              'div',
              { className: 'lr-overview-tags' },
              paper.tags.slice(0, 8).map((tag) =>
                h('span', { className: 'lr-tag', key: tag }, `#${tag}`),
              ),
            )
          : null,
        h(
          'div',
          { className: 'lr-overview-actions' },
          summaryRunning
            ? h(
                'button',
                { type: 'button', className: 'lr-btn small primary', disabled: true },
                h(Spinner, { size: 12 }),
                t('summaryRunning'),
              )
            : hasSummary
              ? [
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn small primary',
                      onClick: onStudyNote,
                      key: 'open-note',
                    },
                    h(Icon, { name: 'book', size: 13 }),
                    t('noteOpen'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn small accent',
                      onClick: onPreview,
                      key: 'preview',
                    },
                    h(Icon, { name: 'note', size: 13 }),
                    t('preview'),
                  ),
                ]
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn small primary lr-summary-cta',
                    onClick: onSummary,
                    disabled: summaryRunning,
                  },
                  h(Icon, { name: 'sparkle', size: 13 }),
                  t('summary'),
                ),
        ),
      )
    }

    function relDir(rel) {
      const normalized = String(rel || '').replace(/\\/g, '/')
      const index = normalized.lastIndexOf('/')
      return index < 0 ? '' : normalized.slice(0, index)
    }

    function relBase(rel) {
      const normalized = String(rel || '').replace(/\\/g, '/')
      const index = normalized.lastIndexOf('/')
      return index < 0 ? normalized : normalized.slice(index + 1)
    }

    function noteStemSuggestion(noteStem, oldStem, desired) {
      const lowerNote = noteStem.toLowerCase()
      const lowerOld = oldStem.toLowerCase()
      const index = lowerNote.indexOf(lowerOld)
      if (index >= 0) {
        return `${noteStem.slice(0, index)}${desired}${noteStem.slice(index + oldStem.length)}`
      }
      const cleanOld = oldStem.replace(/\s*[（(]\d+[)）]\s*$/u, '').trim()
      if (cleanOld.length >= 3 && lowerNote.startsWith(cleanOld.toLowerCase())) {
        return `${desired}${noteStem.slice(cleanOld.length)}`
      }
      return desired
    }

    function suggestedNoteName(item, newFileName) {
      if (!item?.noteRel) return ''
      const newStem = String(newFileName || '').trim()
      const oldStem = String(item.stem || '').trim()
      if (!newStem || newStem === oldStem) return ''
      const noteRel = String(item.noteRel).replace(/\\/g, '/')
      const folder = relDir(noteRel)
      const noteStem = relBase(noteRel).replace(/\.md$/i, '')
      const target =
        noteStem.toLowerCase() === oldStem.toLowerCase()
          ? newStem
          : noteStemSuggestion(noteStem, oldStem, newStem)
      return folder ? `${folder}/${target}.md` : `${target}.md`
    }

    function VaultLibraryView({
      data,
      loading,
      error,
      busy,
      onRefresh,
      onOpenPdf,
      onOpenNote,
      onOpenLegacy,
      onImport,
      onSave,
      onCreateFolder,
      onMoveEntry,
      onRenameFolder,
      onDeleteEntry,
      onDeleteCache,
      dataDir,
      onBack,
    }) {
      const [activeFolder, setActiveFolder] = useState('')
      const [includeChildren, setIncludeChildren] = useState(true)
      const [tab, setTab] = useState('pdfs')
      const [search, setSearch] = useState('')
      const [editing, setEditing] = useState(null)
      const [form, setForm] = useState({ title: '', fileName: '', tags: '' })
      const [editError, setEditError] = useState('')
      const [saving, setSaving] = useState(false)
      const [folderModal, setFolderModal] = useState(false)
      const [folderName, setFolderName] = useState('')
      const [folderError, setFolderError] = useState('')
      const [localError, setLocalError] = useState('')
      const [draggingEntry, setDraggingEntry] = useState(null)
      const [dropTarget, setDropTarget] = useState(null)
      const [renameTarget, setRenameTarget] = useState(null)
      const [renameValue, setRenameValue] = useState('')
      const [renameError, setRenameError] = useState('')
      const [renaming, setRenaming] = useState(false)
      const [deleteTarget, setDeleteTarget] = useState(null)
      const [deleteNotesToo, setDeleteNotesToo] = useState(false)
      // 三选一 delete (spec §12.3): keep the vault trio, summary only, or all.
      const [deleteVaultFiles, setDeleteVaultFiles] = useState('keep')
      const [deleteError, setDeleteError] = useState('')
      const [deleting, setDeleting] = useState(false)
      // PDF rows collapse by default; the expanded set holds the open ones.
      const [expandedPdf, setExpandedPdf] = useState(null)
      const [showAllNotes, setShowAllNotes] = useState(false)

      useEffect(() => {
        if (!data) return
        if (activeFolder && !data.folders.some((folder) => folder.rel === activeFolder)) {
          setActiveFolder('')
        }
      }, [data, activeFolder])

      const pdfs = data?.pdfs || []
      const notes = data?.notes || []
      const folders = data?.folders || []
      const query = search.trim().toLowerCase()
      const belongs = (folder) => {
        if (!activeFolder) return true
        if (includeChildren) {
          return folder === activeFolder || folder.startsWith(`${activeFolder}/`)
        }
        return folder === activeFolder
      }
      const matches = (item) => {
        if (query) {
          const haystack = [item.title, item.fileName, item.folder, ...(item.tags || [])]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query)) return false
        }
        return belongs(item.folder || '')
      }
      const visiblePdfs = pdfs.filter(matches)
      const visibleNotes = notes.filter(matches)
      // 「笔记」tab: standalone notes only by default; the toggle restores the
      // flat list of everything (spec §14.8).
      const standaloneNotes = visibleNotes.filter(isStandaloneNote)
      const listedNotes = showAllNotes ? visibleNotes : standaloneNotes
      const folderLabel = activeFolder || t('allItems')

      function statusText(item) {
        if (!item.paperId) return t('statusUnread')
        if (item.status === 'processing') return t('statusProcessing')
        if (item.status === 'error') return t('statusError')
        if (item.analysisReady) return t('statusReady')
        return t('statusUnread')
      }

      function statusClass(item) {
        if (!item.paperId) return 'idle'
        if (item.status === 'processing') return 'warn'
        if (item.status === 'error') return 'bad'
        if (item.analysisReady) return 'ok'
        return 'idle'
      }

      function openEdit(item) {
        setEditing(item)
        setForm({
          title: item.title || item.stem || '',
          fileName: item.stem || '',
          tags: (item.tags || []).join(', '),
          renameNote: true,
        })
        setEditError('')
      }

      async function saveEdit() {
        if (!editing || saving) return
        if (!form.title.trim()) {
          setEditError(t('titleLabel') + '不能为空')
          return
        }
        if (!form.fileName.trim()) {
          setEditError(t('fileNameLabel') + '不能为空')
          return
        }
        setSaving(true)
        setEditError('')
        setLocalError('')
        try {
          await onSave(editing, {
            title: form.title.trim(),
            fileName: form.fileName.trim(),
            renameNote: form.renameNote !== false,
            tags: form.tags
              .split(/[,，、;；]/)
              .map((tag) => tag.trim().replace(/^#/, ''))
              .filter(Boolean),
          })
          setEditing(null)
        } catch (saveError) {
          setEditError(saveError.message || String(saveError))
        } finally {
          setSaving(false)
        }
      }

      async function createFolder() {
        if (!folderName.trim() || saving) return
        setSaving(true)
        setFolderError('')
        try {
          const rel = await onCreateFolder(activeFolder, folderName.trim())
          setFolderName('')
          setFolderModal(false)
          if (rel) setActiveFolder(rel)
        } catch (folderSaveError) {
          setFolderError(folderSaveError.message || String(folderSaveError))
        } finally {
          setSaving(false)
        }
      }

      async function openPdf(item) {
        setLocalError('')
        try {
          await onOpenPdf(item)
        } catch (openError) {
          setLocalError(openError.message || String(openError))
        }
      }

      function fillTemplate(template, values) {
        let output = template
        for (const [key, value] of Object.entries(values)) {
          output = output.split(`{${key}}`).join(String(value))
        }
        return output
      }

      function relatedNotesOf(item) {
        if (!item) return []
        if (Array.isArray(item.relatedNotes) && item.relatedNotes.length > 0) return item.relatedNotes
        if (item.noteRel) {
          return [{ rel: item.noteRel, title: item.noteTitle || relBase(item.noteRel), isSummary: false }]
        }
        return []
      }

      // 三件套 (spec §12.4): the server reports the two companions explicitly.
      // Older payloads only carry `noteRel`, so keep that as a hint rather than
      // guessing from note titles.
      function summaryOf(item) {
        if (!item) return ''
        if (item.summaryRel) return item.summaryRel
        const notes = relatedNotesOf(item)
        const match = notes.find((note) => note.isSummary)
        return match ? match.rel : ''
      }

      function readerNoteOf(item) {
        if (!item) return ''
        if (item.readerNoteRel) return item.readerNoteRel
        const notes = relatedNotesOf(item)
        const match = notes.find(
          (note) => note.noteRole === 'reader-note' || (typeof note.title === 'string' && /阅读笔记$/.test(note.title)),
        )
        return match ? match.rel : ''
      }

      // 「笔记」tab default view: only notes that belong to no paper (spec §14.8).
      function isStandaloneNote(note) {
        if (!note) return false
        if (note.paperRel || note.paperId) return false
        if (note.isSummary) return false
        if (note.noteRole === 'reader-note') return false
        const title = String(note.title || '')
        if (/(?:总结|笔记)$/.test(title)) return false
        return true
      }

      function openRename(folder) {
        setRenameTarget(folder)
        setRenameValue(folder.name || '')
        setRenameError('')
      }

      async function saveRename() {
        if (!renameTarget || renaming) return
        const nextName = renameValue.trim()
        if (!nextName) {
          setRenameError(`${t('folderName')}不能为空`)
          return
        }
        setRenaming(true)
        setRenameError('')
        try {
          const result = await onRenameFolder(renameTarget.rel, nextName)
          if (activeFolder === renameTarget.rel || activeFolder.startsWith(`${renameTarget.rel}/`)) {
            setActiveFolder(`${result.rel}${activeFolder.slice(renameTarget.rel.length)}`)
          }
          setRenameTarget(null)
        } catch (renameFailure) {
          setRenameError(renameFailure.message || String(renameFailure))
        } finally {
          setRenaming(false)
        }
      }

      function requestDelete(target) {
        setDeleteTarget(target)
        setDeleteNotesToo(false)
        setDeleteVaultFiles('keep')
        setDeleteError('')
      }

      function deleteTitle(target) {
        if (!target) return t('delete')
        if (target.kind === 'folder') return t('deleteFolder')
        if (target.kind === 'note') return t('deleteNote')
        if (target.kind === 'cache') return t('deleteCache')
        return t('deletePdf')
      }

      async function confirmDelete() {
        if (!deleteTarget || deleting) return
        setDeleting(true)
        setDeleteError('')
        try {
          if (deleteTarget.kind === 'cache') {
            await onDeleteCache(deleteTarget.item)
          } else {
            // `vaultFiles` is the spec §12.3三选一; `deleteNotes` stays for the
            // older host that only understands the boolean.
            await onDeleteEntry(deleteTarget, {
              vaultFiles: deleteTarget.kind === 'pdf' ? deleteVaultFiles : 'keep',
              deleteNotes: deleteTarget.kind === 'pdf' ? deleteVaultFiles === 'all' : deleteNotesToo,
            })
          }
          if (
            deleteTarget.kind === 'folder' &&
            (activeFolder === deleteTarget.rel || activeFolder.startsWith(`${deleteTarget.rel}/`))
          ) {
            setActiveFolder('')
          }
          setDeleteTarget(null)
        } catch (deleteFailure) {
          setDeleteError(deleteFailure.message || String(deleteFailure))
        } finally {
          setDeleting(false)
        }
      }

      function startDrag(event, item, kind) {
        if (busy) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData(
          'application/x-lr-entry',
          JSON.stringify({ rel: item.rel, kind, folder: item.folder || '' }),
        )
        event.dataTransfer.setData('text/plain', item.rel)
        event.dataTransfer.effectAllowed = 'move'
        setDraggingEntry({ rel: item.rel, kind, folder: item.folder || '' })
      }

      function endDrag() {
        setDraggingEntry(null)
        setDropTarget(null)
      }

      // The HTML5 drop contract only fires when a dragover handler called
      // preventDefault(). Gating on a dataTransfer type (not just React state)
      // keeps drags working even if a state update has not been committed yet.
      const DRAG_MIME = 'application/x-lr-entry'

      function isEntryDrag(event) {
        const types = event.dataTransfer?.types
        if (!types) return Boolean(draggingEntry)
        return Array.from(types).includes(DRAG_MIME) || Array.from(types).includes('text/plain')
      }

      function dragOverFolder(event, folder) {
        if (!isEntryDrag(event)) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        setDropTarget((current) => (current === folder ? current : folder))
      }

      function dragLeaveFolder(event, folder) {
        if (event.currentTarget.contains(event.relatedTarget)) return
        setDropTarget((current) => (current === folder ? null : current))
      }

      async function dropOnFolder(event, folder) {
        if (!isEntryDrag(event)) return
        event.preventDefault()
        const source = draggingEntry
        let raw = ''
        try {
          raw = event.dataTransfer?.getData(DRAG_MIME) || ''
        } catch {
          raw = ''
        }
        setDropTarget(null)
        setDraggingEntry(null)
        let payload = source || null
        if (raw) {
          try {
            payload = JSON.parse(raw)
          } catch {
            payload = source
          }
        }
        if (!payload?.rel || (payload.folder || '') === (folder || '')) return
        // A drag can outlive the state that started it (a read/import kicked off
        // mid-drag); refuse to write while the library is busy.
        if (busy) {
          setLocalError(t('busyMoveBlocked'))
          return
        }
        setLocalError('')
        try {
          await onMoveEntry(payload.rel, payload.kind, folder || '')
        } catch (moveFailure) {
          setLocalError(moveFailure.message || String(moveFailure))
        }
      }

      const deleteItem = deleteTarget?.item || deleteTarget
      const deleteRelatedNotes = deleteTarget?.kind === 'pdf' ? relatedNotesOf(deleteItem) : []
      const deleteBackupPath = `${dataDir || 'D:\\DSH-Literature'}\\backups`
      const deleteFolderStats =
        deleteTarget?.kind === 'folder'
          ? { pdfs: deleteTarget.pdfCount || 0, notes: deleteTarget.noteCount || 0 }
          : null

      return h(
        'div',
        { className: 'lr-library' },
        h(
          'header',
          { className: 'lr-library-head' },
          h(
            'div',
            { className: 'lr-library-head-left' },
            h(
              'button',
              { type: 'button', className: 'lr-btn', onClick: onBack },
              h(Icon, { name: 'chevronLeft', size: 15 }),
              t('backToReader'),
            ),
            h(
              'div',
              { className: 'lr-library-title-block' },
              h('div', { className: 'lr-library-kicker' }, t('vaultKicker')),
              h('div', { className: 'lr-library-title' }, t('libraryTitle')),
              h(
                'div',
                { className: 'lr-library-path' },
                data?.vault?.path || 'D:\\note',
                data
                  ? [
                      h(
                        'span',
                        { className: 'lr-stat-chip', key: 'folders' },
                        `${data.stats.folders} ${t('foldersCount')}`,
                      ),
                      h(
                        'span',
                        { className: 'lr-stat-chip accent', key: 'pdfs' },
                        `${data.stats.pdfs} ${t('pdfsCount')}`,
                      ),
                      h(
                        'span',
                        { className: 'lr-stat-chip warm', key: 'notes' },
                        `${data.stats.notes} ${t('notesCount')}`,
                      ),
                    ]
                  : null,
              ),
            ),
          ),
          h(
            'div',
            { className: 'lr-library-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn icon',
                onClick: () => onRefresh(true),
                disabled: loading,
                title: t('refresh'),
              },
              loading ? h(Spinner, { size: 14 }) : h(Icon, { name: 'refresh', size: 15 }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn',
                onClick: () => {
                  setFolderModal(true)
                  setFolderName('')
                  setFolderError('')
                },
                title: t('newFolder'),
              },
              h(Icon, { name: 'plus', size: 14 }),
              h('span', { className: 'lr-label' }, t('newFolder')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn primary',
                onClick: () => onImport(activeFolder),
                title: `${t('importHere')}：${folderLabel}`,
              },
              h(Icon, { name: 'upload', size: 14 }),
              h('span', null, t('importHere')),
              h('span', { className: 'lr-dest-chip' }, folderLabel),
            ),
          ),
        ),
        error
          ? h(
              'div',
              { className: 'lr-error-banner' },
              h(Icon, { name: 'close', size: 14 }),
              h('span', null, error),
              h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: () => onRefresh(true) },
                t('retry'),
              ),
            )
          : null,
        localError
          ? h(
              'div',
              { className: 'lr-error-banner' },
              h(Icon, { name: 'close', size: 14 }),
              h('span', null, localError),
              h(
                'button',
                { type: 'button', className: 'lr-error-close', onClick: () => setLocalError('') },
                h(Icon, { name: 'close', size: 12 }),
              ),
            )
          : null,
        h(
          'div',
          { className: 'lr-library-body' },
          h(
            'aside',
            { className: 'lr-folder-pane' },
            h('div', { className: 'lr-folder-kicker' }, t('vaultKicker')),
            h(
              'div',
              {
                className: `lr-folder-row root ${activeFolder === '' ? 'active' : ''} ${dropTarget === '' ? 'drop-target' : ''}`,
                onDragOver: (event) => dragOverFolder(event, ''),
                onDragLeave: (event) => dragLeaveFolder(event, ''),
                onDrop: (event) => dropOnFolder(event, ''),
                title: t('dragHint'),
              },
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-folder-main',
                  onClick: () => setActiveFolder(''),
                },
                h(Icon, { name: 'book', size: 14 }),
                h('span', { className: 'lr-folder-name' }, t('allItems')),
                h('span', { className: 'lr-folder-count' }, String(data?.stats?.pdfs || 0)),
              ),
            ),
            h('div', { className: 'lr-folder-divider' }),
            h(
              'div',
              { className: 'lr-folder-list' },
              folders.map((folder) =>
                h(
                  'div',
                  {
                    key: folder.rel,
                    className: `lr-folder-row ${activeFolder === folder.rel ? 'active' : ''} ${dropTarget === folder.rel ? 'drop-target' : ''}`,
                    onDragOver: (event) => dragOverFolder(event, folder.rel),
                    onDragLeave: (event) => dragLeaveFolder(event, folder.rel),
                    onDrop: (event) => dropOnFolder(event, folder.rel),
                    title:
                      dropTarget === folder.rel
                        ? fillTemplate(t('dropHere'), { name: folder.name })
                        : folder.rel,
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-folder-main',
                      style: { paddingLeft: `${10 + Math.max(0, folder.depth - 1) * 14}px` },
                      title: folder.rel,
                      onClick: () => setActiveFolder(folder.rel),
                    },
                    h(Icon, { name: 'folder', size: 13 }),
                    h('span', { className: 'lr-folder-name' }, folder.name),
                    h('span', { className: 'lr-folder-count' }, String(folder.pdfCount + folder.noteCount)),
                  ),
                  h(
                    'div',
                    { className: 'lr-folder-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-folder-action',
                        title: t('renameFolder'),
                        'aria-label': `${t('renameFolder')}: ${folder.name}`,
                        onClick: (event) => {
                          event.stopPropagation()
                          openRename(folder)
                        },
                      },
                      h(Icon, { name: 'pen', size: 12 }),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-folder-action danger',
                        title: t('deleteFolder'),
                        'aria-label': `${t('deleteFolder')}: ${folder.name}`,
                        onClick: (event) => {
                          event.stopPropagation()
                          requestDelete({
                            kind: 'folder',
                            rel: folder.rel,
                            name: folder.name,
                            pdfCount: folder.pdfCount,
                            noteCount: folder.noteCount,
                          })
                        },
                      },
                      h(Icon, { name: 'trash', size: 12 }),
                    ),
                  ),
                ),
              ),
            ),
          ),
          h(
            'main',
            {
              className: `lr-library-main ${dropTarget === '\u0000current' ? 'drop-target-root' : ''}`,
              // Dropping on empty space moves the entry into the folder that is
              // currently open, which is what users expect after filtering.
              onDragOver: (event) => dragOverFolder(event, '\u0000current'),
              onDragLeave: (event) => dragLeaveFolder(event, '\u0000current'),
              onDrop: (event) => dropOnFolder(event, activeFolder || ''),
            },
            h(
              'div',
              { className: 'lr-library-toolbar' },
              h(
                'div',
                { className: 'lr-library-tabs' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: `lr-library-tab ${tab === 'pdfs' ? 'active' : ''}`,
                    onClick: () => setTab('pdfs'),
                  },
                  h(Icon, { name: 'book', size: 13 }),
                  t('pdfTab'),
                  h('span', null, String(visiblePdfs.length)),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: `lr-library-tab ${tab === 'notes' ? 'active' : ''}`,
                    onClick: () => setTab('notes'),
                  },
                  h(Icon, { name: 'note', size: 13 }),
                  t('notesTab'),
                  h('span', null, String(visibleNotes.length)),
                ),
              ),
              h(
                'label',
                { className: 'lr-library-search' },
                h(Icon, { name: 'search', size: 14 }),
                h('input', {
                  value: search,
                  onChange: (event) => setSearch(event.target.value),
                  placeholder: t('searchLibrary'),
                }),
              ),
              h(
                'label',
                { className: 'lr-check' },
                h('input', {
                  type: 'checkbox',
                  checked: includeChildren,
                  onChange: (event) => setIncludeChildren(event.target.checked),
                }),
                h('span', null, t('includeChildren')),
              ),
            ),
            h(
              'div',
              { className: 'lr-library-breadcrumb' },
              h(Icon, { name: 'folder', size: 13 }),
              h('span', null, folderLabel),
              h('span', { className: 'lr-library-count' }, `${visiblePdfs.length + visibleNotes.length}`),
              h(
                'span',
                { className: 'lr-drag-hint' },
                h(Icon, { name: 'grip', size: 12 }),
                t('dragHint'),
              ),
              h('span', { className: 'lr-library-sync' }, t('syncHint')),
            ),
            loading && !data
              ? h(
                  'div',
                  { className: 'lr-library-loading' },
                  h(Spinner, { size: 18 }),
                  t('libraryLoading'),
                )
              : tab === 'pdfs'
                ? h(
                    'div',
                    { className: 'lr-pdf-grid' },
                    visiblePdfs.map((item) =>
                      h(
                        'article',
                        {
                          className: `lr-pdf-card ${statusClass(item)} ${draggingEntry?.rel === item.rel && draggingEntry.kind === 'pdf' ? 'is-dragging' : ''}`,
                          key: item.rel,
                          draggable: true,
                          onDragStart: (event) => startDrag(event, item, 'pdf'),
                          onDragEnd: endDrag,
                        },
                        h(
                          'div',
                          { className: 'lr-pdf-card-top' },
                          h('span', { className: 'lr-pdf-icon' }, h(Icon, { name: 'book', size: 16 })),
                          h(
                            'span',
                            { className: `lr-status-pill ${statusClass(item)}` },
                            h('span', { className: 'lr-dot' }),
                            statusText(item),
                          ),
                          item.hasSummary
                            ? h('span', { className: 'lr-summary-pill' }, t('readerNoteBadgeSummary'))
                            : null,
                          readerNoteOf(item)
                            ? h('span', { className: 'lr-reader-note-pill' }, t('readerNoteBadgeNote'))
                            : null,
                          h(
                            'div',
                            { className: 'lr-card-actions' },
                            h(
                              'span',
                              { className: 'lr-drag-handle', title: t('dragHint'), 'aria-hidden': true },
                              h(Icon, { name: 'grip', size: 13 }),
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'lr-card-action danger',
                                title: t('deletePdf'),
                                'aria-label': `${t('deletePdf')}: ${item.title}`,
                                onClick: () => requestDelete({ kind: 'pdf', item }),
                              },
                              h(Icon, { name: 'trash', size: 13 }),
                            ),
                          ),
                        ),
                        h('div', { className: 'lr-pdf-title', title: item.title }, item.title),
                        h(
                          'div',
                          { className: 'lr-pdf-path', title: item.rel },
                          h(Icon, { name: 'folder', size: 11 }),
                          h('span', null, item.folder || t('vaultRoot')),
                          h('span', { className: 'lr-pdf-sep' }, '/'),
                          h('span', null, item.fileName),
                        ),
                        item.tags?.length
                          ? h(
                              'div',
                              { className: 'lr-tags' },
                              item.tags.slice(0, 6).map((tag) =>
                                h('span', { className: 'lr-tag', key: tag }, `#${tag}`),
                              ),
                            )
                          : h('div', { className: 'lr-pdf-notags' }, '—'),
                        item.noteRel
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'lr-note-link',
                                title: item.noteRel,
                                onClick: () => onOpenNote(item.noteRel),
                              },
                              h(Icon, { name: 'note', size: 12 }),
                              t('associatedNote'),
                              h('span', null, relBase(item.noteRel).replace(/\.md$/i, '')),
                            )
                          : null,
                        // Expand/collapse reveals the 三件套 actions (spec §12.4).
                        h(
                          'button',
                          {
                            type: 'button',
                            className: `lr-pdf-expand${expandedPdf === item.rel ? ' open' : ''}`,
                            'aria-expanded': expandedPdf === item.rel,
                            title: expandedPdf === item.rel ? t('readerNoteCollapseRow') : t('readerNoteExpandRow'),
                            onClick: () => setExpandedPdf(expandedPdf === item.rel ? null : item.rel),
                          },
                          h(Icon, { name: expandedPdf === item.rel ? 'collapse' : 'expand', size: 12 }),
                          expandedPdf === item.rel ? t('readerNoteCollapseRow') : t('readerNoteExpandRow'),
                        ),
                        expandedPdf === item.rel
                          ? h(
                              'div',
                              { className: 'lr-pdf-trio' },
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lr-btn small',
                                  disabled: !summaryOf(item),
                                  title: summaryOf(item) || t('readerNoteMissingSummary'),
                                  onClick: () => summaryOf(item) && onOpenNote(summaryOf(item)),
                                },
                                h(Icon, { name: 'sparkle', size: 12 }),
                                summaryOf(item) ? t('readerNoteOpenSummary') : t('readerNoteMissingSummary'),
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lr-btn small',
                                  disabled: !readerNoteOf(item),
                                  title: readerNoteOf(item) || t('readerNoteMissingNote'),
                                  onClick: () => readerNoteOf(item) && onOpenNote(readerNoteOf(item)),
                                },
                                h(Icon, { name: 'note', size: 12 }),
                                readerNoteOf(item) ? t('readerNoteOpenReaderNote') : t('readerNoteMissingNote'),
                              ),
                            )
                          : null,
                        h(
                          'div',
                          { className: 'lr-pdf-footer' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: `lr-btn small ${item.paperId ? 'accent' : 'primary'}`,
                              onClick: () => openPdf(item),
                              disabled: busy === item.rel || Boolean(busy),
                            },
                            busy === item.rel ? h(Spinner, { size: 12 }) : h(Icon, { name: 'book', size: 13 }),
                            item.paperId ? t('continueReading') : t('read'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lr-btn small',
                              onClick: () => openEdit(item),
                              disabled: Boolean(busy),
                            },
                            h(Icon, { name: 'pen', size: 13 }),
                            t('editItem'),
                          ),
                        ),
                      ),
                    ),
                    visiblePdfs.length === 0
                      ? h(
                          'div',
                          { className: 'lr-library-empty' },
                          h(Icon, { name: 'book', size: 28 }),
                          h('div', null, query ? t('noSearchResults') : t('emptyFolderPdfs')),
                        )
                      : null,
                  )
                : h(
                    'div',
                    { className: 'lr-note-list' },
                    // 「显示全部笔记」(spec §14.8): the default view hides the
                    // notes already reachable from a PDF row.
                    h(
                      'label',
                      { className: 'lr-note-scope' },
                      h('input', {
                        type: 'checkbox',
                        checked: showAllNotes,
                        onChange: (event) => setShowAllNotes(event.target.checked),
                      }),
                      h('span', null, showAllNotes ? t('readerNoteOnlyStandalone') : t('readerNoteShowAllNotes')),
                    ),
                    listedNotes.map((item) =>
                      h(
                        'article',
                        {
                          className: `lr-note-card ${draggingEntry?.rel === item.rel && draggingEntry.kind === 'note' ? 'is-dragging' : ''}`,
                          key: item.rel,
                          draggable: true,
                          onDragStart: (event) => startDrag(event, item, 'note'),
                          onDragEnd: endDrag,
                        },
                        h(
                          'div',
                          { className: 'lr-note-main' },
                          h('div', { className: 'lr-note-title-row' },
                            h(Icon, { name: 'note', size: 15 }),
                            h('div', { className: 'lr-note-title' }, item.title),
                            item.isSummary
                              ? h('span', { className: 'lr-summary-pill' }, t('readerNoteBadgeSummary'))
                              : null,
                            !item.isSummary && !isStandaloneNote(item)
                              ? h('span', { className: 'lr-reader-note-pill' }, t('readerNoteBadgeNote'))
                              : null,
                            showAllNotes && isStandaloneNote(item)
                              ? h('span', { className: 'lr-standalone-pill' }, t('readerNoteStandalone'))
                              : null,
                          ),
                          h('div', { className: 'lr-note-path' }, item.rel),
                          item.tags?.length
                            ? h(
                                'div',
                                { className: 'lr-tags' },
                                item.tags.slice(0, 6).map((tag) =>
                                  h('span', { className: 'lr-tag', key: tag }, `#${tag}`),
                                ),
                              )
                            : null,
                        ),
                        h(
                          'div',
                          { className: 'lr-note-actions' },
                          h(
                            'span',
                            { className: 'lr-drag-handle', title: t('dragHint'), 'aria-hidden': true },
                            h(Icon, { name: 'grip', size: 13 }),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lr-btn small',
                              onClick: () => onOpenNote(item.rel),
                            },
                            h(Icon, { name: 'note', size: 13 }),
                            t('openNote'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lr-card-action danger',
                              title: t('deleteNote'),
                              'aria-label': `${t('deleteNote')}: ${item.title}`,
                              onClick: () => requestDelete({ kind: 'note', item }),
                            },
                            h(Icon, { name: 'trash', size: 13 }),
                          ),
                        ),
                      ),
                    ),
                    listedNotes.length === 0
                      ? h(
                          'div',
                          { className: 'lr-library-empty' },
                          h(Icon, { name: 'note', size: 28 }),
                          h('div', null, query ? t('noSearchResults') : t('emptyFolderNotes')),
                        )
                      : null,
                  ),
            data?.detached?.length
              ? h(
                  'section',
                  { className: 'lr-detached' },
                  h('div', { className: 'lr-detached-title' }, t('detachedTitle')),
                  h(
                    'div',
                    { className: 'lr-detached-list' },
                    data.detached.map((item) =>
                      h(
                        'div',
                        { className: 'lr-detached-row', key: item.paperId },
                        h(Icon, { name: 'book', size: 13 }),
                        h('span', { className: 'lr-detached-name' }, item.title),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lr-btn small',
                            onClick: () => onOpenLegacy(item.paperId),
                          },
                          t('legacyOpen'),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lr-card-action danger',
                            title: t('deleteCache'),
                            'aria-label': `${t('deleteCache')}: ${item.title}`,
                            onClick: () => requestDelete({ kind: 'cache', item }),
                          },
                          h(Icon, { name: 'trash', size: 13 }),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
          ),
        ),
        editing
          ? h(
              Modal,
              {
                title: t('editItemTitle'),
                subtitle: editing.rel,
                onClose: saving ? undefined : () => setEditing(null),
              },
              h(
                'div',
                { className: 'lr-edit-form' },
                h(
                  'label',
                  null,
                  h('span', null, t('titleLabel')),
                  h('input', {
                    value: form.title,
                    onChange: (event) => setForm((current) => ({ ...current, title: event.target.value })),
                    autoFocus: true,
                  }),
                ),
                h(
                  'label',
                  null,
                  h('span', null, t('fileNameLabel')),
                  h(
                    'div',
                    { className: 'lr-filename-input' },
                    h('input', {
                      value: form.fileName,
                      onChange: (event) => setForm((current) => ({ ...current, fileName: event.target.value })),
                    }),
                    h('span', null, '.pdf'),
                  ),
                ),
                h(
                  'label',
                  null,
                  h('span', null, t('tagsLabel')),
                  h('input', {
                    value: form.tags,
                    onChange: (event) => setForm((current) => ({ ...current, tags: event.target.value })),
                    placeholder: 'SerDes, PAM-4, 接收机',
                  }),
                ),
                h(
                  'div',
                  { className: 'lr-edit-note' },
                  h(Icon, { name: 'note', size: 13 }),
                  editing.noteRel
                    ? `${t('associatedNote')}：${editing.noteRel}`
                    : t('noAssociatedNote'),
                ),
                editing.noteRel && suggestedNoteName(editing, form.fileName)
                  ? h(
                      'div',
                      { className: 'lr-rename-note' },
                      h(
                        'label',
                        { className: 'lr-check' },
                        h('input', {
                          type: 'checkbox',
                          checked: form.renameNote !== false,
                          onChange: (event) =>
                            setForm((current) => ({
                              ...current,
                              renameNote: event.target.checked,
                            })),
                        }),
                        h('span', null, t('renameNoteToggle')),
                      ),
                      h(
                        'div',
                        { className: 'lr-rename-note-target' },
                        form.renameNote !== false
                          ? t('renameNoteTarget').replace(
                              '{name}',
                              suggestedNoteName(editing, form.fileName),
                            )
                          : t('keepNoteName'),
                      ),
                    )
                  : null,
                h(
                  'div',
                  { className: 'lr-edit-warning' },
                  h(Icon, { name: 'refresh', size: 13 }),
                  t('renameWarning'),
                ),
                editError ? h('div', { className: 'lr-edit-error' }, editError) : null,
                h(
                  'div',
                  { className: 'lr-edit-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn', onClick: () => setEditing(null), disabled: saving },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn primary', onClick: saveEdit, disabled: saving },
                    saving ? h(Spinner, { size: 13 }) : h(Icon, { name: 'check', size: 13 }),
                    saving ? t('saving') : t('save'),
                  ),
                ),
              ),
            )
          : null,
        folderModal
          ? h(
              Modal,
              {
                title: t('createFolderTitle'),
                subtitle: folderLabel,
                onClose: saving ? undefined : () => setFolderModal(false),
              },
              h(
                'div',
                { className: 'lr-edit-form' },
                h(
                  'label',
                  null,
                  h('span', null, t('folderName')),
                  h('input', {
                    value: folderName,
                    onChange: (event) => setFolderName(event.target.value),
                    autoFocus: true,
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') createFolder()
                    },
                  }),
                ),
                folderError ? h('div', { className: 'lr-edit-error' }, folderError) : null,
                h(
                  'div',
                  { className: 'lr-edit-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn', onClick: () => setFolderModal(false), disabled: saving },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn primary', onClick: createFolder, disabled: saving },
                    saving ? h(Spinner, { size: 13 }) : h(Icon, { name: 'plus', size: 13 }),
                    t('create'),
                  ),
                ),
              ),
            )
          : null,
        renameTarget
          ? h(
              Modal,
              {
                title: t('renameFolder'),
                subtitle: renameTarget.rel,
                onClose: renaming ? undefined : () => setRenameTarget(null),
              },
              h(
                'div',
                { className: 'lr-edit-form' },
                h(
                  'label',
                  null,
                  h('span', null, t('folderName')),
                  h('input', {
                    value: renameValue,
                    onChange: (event) => setRenameValue(event.target.value),
                    autoFocus: true,
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') saveRename()
                    },
                  }),
                ),
                h(
                  'div',
                  { className: 'lr-edit-note' },
                  h(Icon, { name: 'folder', size: 13 }),
                  t('renameFolderHint'),
                ),
                renameError ? h('div', { className: 'lr-edit-error' }, renameError) : null,
                h(
                  'div',
                  { className: 'lr-edit-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn',
                      onClick: () => setRenameTarget(null),
                      disabled: renaming,
                    },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn primary', onClick: saveRename, disabled: renaming },
                    renaming ? h(Spinner, { size: 13 }) : h(Icon, { name: 'check', size: 13 }),
                    renaming ? t('saving') : t('rename'),
                  ),
                ),
              ),
            )
          : null,
        deleteTarget
          ? h(
              Modal,
              {
                title: deleteTitle(deleteTarget),
                subtitle:
                  deleteTarget.kind === 'folder' ? deleteTarget.rel : deleteItem?.rel || '',
                onClose: deleting ? undefined : () => setDeleteTarget(null),
              },
              h(
                'div',
                { className: 'lr-delete-dialog' },
                h(
                  'div',
                  { className: 'lr-delete-warning' },
                  h(Icon, { name: 'trash', size: 16 }),
                  h(
                    'div',
                    { className: 'lr-delete-warning-copy' },
                    h(
                      'div',
                      { className: 'lr-delete-warning-title' },
                      deleteTarget.kind === 'folder'
                        ? fillTemplate(t('confirmDeleteFolder'), {
                            name: deleteTarget.name,
                            pdfs: deleteFolderStats?.pdfs || 0,
                            notes: deleteFolderStats?.notes || 0,
                          })
                        : deleteTarget.kind === 'note'
                          ? t('confirmDeleteNote')
                          : deleteTarget.kind === 'cache'
                            ? t('deleteCacheOnly')
                            : t('confirmDeletePdf'),
                    ),
                    deleteTarget.kind === 'folder'
                      ? h('div', { className: 'lr-delete-warning-text' }, t('deleteFolderWarning'))
                      : deleteTarget.kind === 'note'
                        ? h('div', { className: 'lr-delete-warning-text' }, t('deleteNoteWarning'))
                        : deleteTarget.kind === 'pdf'
                          ? h('div', { className: 'lr-delete-warning-text' }, t('deletePdfWarning'))
                          : null,
                  ),
                ),
                h(
                  'div',
                  { className: 'lr-delete-path' },
                  h(Icon, { name: deleteTarget.kind === 'folder' ? 'folder' : 'note', size: 12 }),
                  h(
                    'span',
                    null,
                    deleteTarget.kind === 'cache'
                      ? deleteItem?.vaultPath || deleteItem?.title || ''
                      : deleteTarget.kind === 'folder'
                        ? deleteTarget.rel
                        : deleteItem?.rel || '',
                  ),
                ),
                deleteTarget.kind === 'folder'
                  ? h(
                      'div',
                      { className: 'lr-delete-counts' },
                      h(
                        'span',
                        { className: 'lr-stat-chip accent' },
                        `${deleteFolderStats?.pdfs || 0} ${t('pdfsCount')}`,
                      ),
                      h(
                        'span',
                        { className: 'lr-stat-chip warm' },
                        `${deleteFolderStats?.notes || 0} ${t('notesCount')}`,
                      ),
                    )
                  : null,
                deleteTarget.kind === 'pdf'
                  ? h(
                      'div',
                      { className: 'lr-related-notes' },
                      h(
                        'div',
                        { className: 'lr-related-notes-title' },
                        `${t('relatedNotes')} · ${deleteRelatedNotes.length}`,
                      ),
                      deleteRelatedNotes.length > 0
                        ? h(
                            'div',
                            { className: 'lr-related-list' },
                            deleteRelatedNotes.map((note) =>
                              h(
                                'div',
                                { className: 'lr-related-note', key: note.rel },
                                h(Icon, { name: 'note', size: 12 }),
                                h('span', { title: note.rel }, note.rel),
                              ),
                            ),
                          )
                        : h('div', { className: 'lr-delete-hint' }, t('noRelatedNotes')),
                    )
                  : null,
                // 三选一 (spec §12.3): every option says whether the files stay.
                deleteTarget.kind === 'pdf'
                  ? h(
                      'div',
                      { className: 'lr-delete-choice' },
                      h('div', { className: 'lr-delete-choice-title' }, t('readerNoteDeleteChoiceTitle')),
                      ...[
                        ['keep', 'readerNoteDeleteKeep', 'readerNoteDeleteKeepDesc'],
                        ['summary', 'readerNoteDeleteSummary', 'readerNoteDeleteSummaryDesc'],
                        ['all', 'readerNoteDeleteAll', 'readerNoteDeleteAllDesc'],
                      ].map(([value, label, description]) =>
                        h(
                          'label',
                          {
                            className: `lr-delete-option${deleteVaultFiles === value ? ' checked' : ''}`,
                            key: value,
                          },
                          h('input', {
                            type: 'radio',
                            name: 'lr-delete-vault-files',
                            value,
                            checked: deleteVaultFiles === value,
                            onChange: () => setDeleteVaultFiles(value),
                          }),
                          h(
                            'span',
                            { className: 'lr-delete-option-body' },
                            h('span', { className: 'lr-delete-option-label' }, t(label)),
                            h(
                              'span',
                              { className: 'lr-delete-option-desc' },
                              fillTemplate(t(description), {
                                name: deleteItem?.stem || deleteItem?.fileName || '',
                              }),
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,
                deleteTarget.kind === 'pdf'
                  ? h('div', { className: 'lr-delete-hint' }, t('readerNoteDeleteBackup'))
                  : null,
                deleteTarget.kind === 'cache'
                  ? null
                  : h(
                      'div',
                      { className: 'lr-delete-hint' },
                      fillTemplate(t('deleteBackupHint'), { path: deleteBackupPath }),
                    ),
                deleteError ? h('div', { className: 'lr-edit-error' }, deleteError) : null,
                h(
                  'div',
                  { className: 'lr-edit-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn',
                      onClick: () => setDeleteTarget(null),
                      disabled: deleting,
                    },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn danger', onClick: confirmDelete, disabled: deleting },
                    deleting ? h(Spinner, { size: 13 }) : h(Icon, { name: 'trash', size: 13 }),
                    deleting ? t('deleting') : t('delete'),
                  ),
                ),
              ),
            )
          : null,
      )
    }

    // ── Summary view: renderer with annotation highlights ────────────────────
    // The Markdown subset from docs/summary-editor-spec.md §3.3 is rendered by
    // `MarkdownDoc`. Every text run becomes a span carrying `data-p` (the plain
    // projection offset) so a DOM selection can be translated back into source
    // offsets without guessing.
    const NOTE_COLORS = ['amber', 'rose', 'sky', 'mint']
    const NOTE_MEDIA_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i
    const NOTE_CITE_RE = /^\[p{1,2}\.\s*(\d+)/i
    const NOTE_FIGURE_LINE_RE = /^\s*\[\[FIGURE:/

    function noteColorLabel(color) {
      if (color === 'rose') return t('noteColorRose')
      if (color === 'sky') return t('noteColorSky')
      if (color === 'mint') return t('noteColorMint')
      return t('noteColorAmber')
    }

    function noteStatusLabel(status) {
      if (status === 'resolved') return t('noteStatusResolved')
      if (status === 'orphan') return t('noteStatusOrphan')
      return t('noteStatusOpen')
    }

    function noteCalloutIcon(kind) {
      switch (String(kind || '').toLowerCase()) {
        case 'figure':
          return 'expand'
        case 'warning':
        case 'danger':
        case 'caution':
        case 'bug':
          return 'close'
        case 'question':
        case 'faq':
        case 'help':
          return 'quote'
        case 'tip':
        case 'success':
        case 'check':
        case 'done':
          return 'check'
        case 'info':
        case 'note':
        case 'todo':
          return 'note'
        default:
          return 'sparkle'
      }
    }

    function noteCalloutLabel(kind) {
      switch (String(kind || '').toLowerCase()) {
        case 'abstract':
        case 'summary':
        case 'tldr':
          return t('noteCalloutAbstract')
        case 'figure':
          return t('noteCalloutFigure')
        case 'warning':
        case 'danger':
        case 'caution':
        case 'bug':
          return t('noteCalloutWarning')
        case 'question':
        case 'faq':
        case 'help':
          return t('noteCalloutQuestion')
        case 'tip':
        case 'success':
        case 'check':
        case 'done':
          return t('noteCalloutTip')
        default:
          return t('noteCalloutInfo')
      }
    }

    // Local preview cannot load `_附件/<paperId>/<name>.png`; the host serves the
    // same file from /papers/:id/figure/:name.
    function resolveNoteFigureSrc(src, paperId) {
      const value = String(src || '').trim()
      if (!value) return ''
      if (/^(https?:|data:|blob:)/i.test(value)) return value
      if (value.indexOf(`${API}/`) === 0) return value
      const clean = value.split('#')[0].split('?')[0]
      const name = clean.slice(clean.lastIndexOf('/') + 1)
      let decoded = name
      try {
        decoded = decodeURIComponent(name)
      } catch {
        decoded = name
      }
      if (!paperId || !NOTE_MEDIA_RE.test(decoded)) return value
      return `${API}/papers/${encodeURIComponent(paperId)}/figure/${encodeURIComponent(decoded)}`
    }

    // Plain projection index of the first character at or after `sourceOffset`.
    function notePlainIndex(projection, sourceOffset) {
      const map = projection && Array.isArray(projection.map) ? projection.map : null
      if (!map || map.length === 0) return 0
      const target = Number.isFinite(sourceOffset) ? sourceOffset : 0
      let low = 0
      let high = map.length - 1
      let found = -1
      while (low <= high) {
        const middle = (low + high) >> 1
        if (map[middle] >= target) {
          found = middle
          high = middle - 1
        } else {
          low = middle + 1
        }
      }
      return found === -1 ? map.length : found
    }

    // Source range -> plain range. Returns null when the range is empty.
    function noteSourceToPlain(projection, start, end) {
      const map = projection && Array.isArray(projection.map) ? projection.map : null
      if (!map || map.length === 0) return null
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
      const from = notePlainIndex(projection, start)
      let low = 0
      let high = map.length - 1
      let last = -1
      while (low <= high) {
        const middle = (low + high) >> 1
        if (map[middle] <= end - 1) {
          last = middle
          low = middle + 1
        } else {
          high = middle - 1
        }
      }
      if (last < 0) return null
      const to = last + 1
      if (to <= from) return null
      return { start: from, end: to }
    }

    // Split annotated ranges into non-overlapping segments; later annotations
    // win when they overlap (spec §9.2).
    function buildNoteSegments(entries) {
      if (!entries || entries.length === 0) return []
      const bounds = []
      for (const entry of entries) {
        bounds.push(entry.plainStart)
        bounds.push(entry.plainEnd)
      }
      bounds.sort((left, right) => left - right)
      const segments = []
      for (let index = 0; index < bounds.length - 1; index += 1) {
        const from = bounds[index]
        const to = bounds[index + 1]
        if (to <= from) continue
        let winner = null
        for (const entry of entries) {
          if (entry.plainStart <= from && entry.plainEnd >= to) winner = entry
        }
        if (!winner) continue
        const last = segments[segments.length - 1]
        if (last && last.entry === winner && last.end === from) last.end = to
        else segments.push({ entry: winner, start: from, end: to })
      }
      return segments
    }

    function noteSegmentStartIndex(segments, from) {
      let low = 0
      let high = segments.length - 1
      let found = segments.length
      while (low <= high) {
        const middle = (low + high) >> 1
        if (segments[middle].end > from) {
          found = middle
          high = middle - 1
        } else {
          low = middle + 1
        }
      }
      return found
    }

    function noteChunksForRange(segments, from, to) {
      const chunks = []
      if (to <= from) return chunks
      let cursor = from
      for (let index = noteSegmentStartIndex(segments, from); index < segments.length; index += 1) {
        const segment = segments[index]
        if (segment.start >= to) break
        const start = Math.max(segment.start, from)
        const end = Math.min(segment.end, to)
        if (end <= start) continue
        if (start > cursor) chunks.push({ start: cursor, end: start, entry: null })
        chunks.push({ start, end, entry: segment.entry })
        cursor = end
      }
      if (cursor < to) chunks.push({ start: cursor, end: to, entry: null })
      return chunks
    }

    // Plain offset of a DOM selection endpoint, or null when the node has no
    // mapped text (captions, badges, toolbar).
    function notePlainOffsetAt(node, offset) {
      if (!node) return null
      if (node.nodeType === 3) {
        const parent = node.parentElement
        const base = parent ? parent.getAttribute('data-p') : null
        if (base == null) return null
        const length = String(node.nodeValue || '').length
        return Number(base) + Math.max(0, Math.min(length, offset))
      }
      if (node.nodeType !== 1) return null
      const own = node.getAttribute('data-p')
      if (own != null) return Number(own)
      const kids = node.childNodes
      if (offset >= 0 && offset < kids.length) {
        const next = kids[offset]
        if (next.nodeType === 1) {
          const value = noteFirstPlain(next)
          if (value != null) return value
        }
      }
      if (offset > 0) {
        const previous = kids[offset - 1]
        if (previous.nodeType === 1) {
          const value = noteLastPlain(previous)
          if (value != null) return value
        }
      }
      return null
    }

    function noteFirstPlain(node) {
      if (!node || node.nodeType !== 1) return null
      const own = node.getAttribute('data-p')
      if (own != null) return Number(own)
      const found = node.querySelector ? node.querySelector('[data-p]') : null
      return found ? Number(found.getAttribute('data-p')) : null
    }

    function noteLastPlain(node) {
      if (!node || node.nodeType !== 1) return null
      const own = node.getAttribute('data-p')
      if (own != null) return Number(own) + String(node.textContent || '').length
      const all = node.querySelectorAll ? node.querySelectorAll('[data-p]') : null
      if (!all || all.length === 0) return null
      const last = all[all.length - 1]
      return Number(last.getAttribute('data-p')) + String(last.textContent || '').length
    }

    function renderNoteRunsAt(text, base, ctx, keyPrefix) {
      const value = typeof text === 'string' ? text : ''
      if (!value) return []
      const segments = ctx.segments || []
      const from = base
      const to = base + value.length
      const chunks = segments.length > 0
        ? noteChunksForRange(segments, from, to)
        : [{ start: from, end: to, entry: null }]
      const out = []
      chunks.forEach((chunk, index) => {
        const slice = value.slice(chunk.start - from, chunk.end - from)
        if (!slice) return
        const key = `${keyPrefix}-c${index}`
        const entry = chunk.entry
        if (!entry) {
          out.push(h('span', { key, className: 'lr-note-t', 'data-p': chunk.start }, slice))
          return
        }
        const ann = entry.ann
        out.push(
          h(
            'mark',
            {
              key,
              className: `lr-ann-mark lr-ann-${ann.color || 'amber'}${ann.status === 'resolved' ? ' is-resolved' : ''}${ann.status === 'orphan' ? ' is-orphan' : ''}`,
              'data-p': chunk.start,
              'data-ann': ann.id,
              title: ann.note || ann.quote || '',
              onClick: (event) => {
                event.stopPropagation()
                ctx.onAnnPick?.(ann.id)
              },
            },
            slice,
          ),
        )
        if (chunk.start === entry.plainStart) {
          out.push(
            h(
              'sup',
              {
                key: `${key}-seq`,
                className: `lr-ann-seq lr-ann-seq-${ann.color || 'amber'}`,
                'data-ann': ann.id,
                title: ann.note || ann.quote || '',
                onClick: (event) => {
                  event.stopPropagation()
                  ctx.onAnnPick?.(ann.id)
                },
              },
              String(entry.number),
            ),
          )
        }
      })
      return out
    }

    function renderNoteInline(inline, ctx, keyPrefix) {
      const out = []
      if (!Array.isArray(inline)) return out
      inline.forEach((item, index) => {
        if (!item || typeof item.text !== 'string') return
        const key = `${keyPrefix}-i${index}`
        if (item.type === 'cite') {
          const match = NOTE_CITE_RE.exec(item.text)
          const page = match ? Number(match[1]) : 0
          out.push(
            h(
              'button',
              {
                key,
                type: 'button',
                className: 'lr-note-cite',
                title: t('citationJump').split('{page}').join(String(page)),
                onClick: (event) => {
                  event.stopPropagation()
                  ctx.onCite?.(page)
                },
              },
              ...renderNoteRunsAt(item.text, notePlainIndex(ctx.projection, item.srcStart), ctx, key),
            ),
          )
          return
        }
        if (item.type === 'link') {
          out.push(
            h(
              'a',
              { key, className: 'lr-note-doc-link', href: item.href, target: '_blank', rel: 'noreferrer noopener' },
              ...renderNoteRunsAt(item.text, notePlainIndex(ctx.projection, item.srcStart), ctx, key),
            ),
          )
          return
        }
        const runs = renderNoteRunsAt(item.text, notePlainIndex(ctx.projection, item.srcStart), ctx, key)
        if (runs.length === 0) return
        if (item.type === 'strong') out.push(h('strong', { key }, ...runs))
        else if (item.type === 'em') out.push(h('em', { key }, ...runs))
        else if (item.type === 'code') out.push(h('code', { key, className: 'lr-note-inline-code' }, ...runs))
        else for (const node of runs) out.push(node)
      })
      return out
    }

    function renderNoteCalloutHead(callout) {
      const title = callout && callout.title ? callout.title : ''
      const kind = callout ? callout.kind : ''
      return h(
        'div',
        { className: 'lr-note-callout-head' },
        h(Icon, { name: noteCalloutIcon(kind), size: 13 }),
        h('span', { className: 'lr-note-callout-title' }, title || noteCalloutLabel(kind)),
      )
    }

    function renderNoteBlocks(blocks, ctx, prefix = 'b') {
      const out = []
      if (!Array.isArray(blocks)) return out
      blocks.forEach((block, index) => {
        if (!block) return
        const key = `${prefix}-${index}`
        if (block.type === 'heading') {
          const level = Math.max(1, Math.min(4, Number(block.level) || 1))
          out.push(
            h(
              `h${level}`,
              { key, className: `lr-note-h lr-note-h${level}`, 'data-block': block.start },
              ...renderNoteInline(block.inline, ctx, key),
            ),
          )
          return
        }
        if (block.type === 'paragraph') {
          const raw = (block.inline || []).map((item) => (item && item.text) || '').join('')
          const pending = NOTE_FIGURE_LINE_RE.test(raw)
          out.push(
            h(
              'p',
              { key, className: `lr-note-p${pending ? ' lr-note-p-pending' : ''}`, 'data-block': block.start },
              pending
                ? h('span', { className: 'lr-note-figure-flag', 'aria-hidden': true }, h(Icon, { name: 'expand', size: 12 }))
                : null,
              ...renderNoteInline(block.inline, ctx, key),
            ),
          )
          return
        }
        if (block.type === 'list') {
          const items = Array.isArray(block.items) ? block.items : []
          out.push(
            h(
              block.ordered ? 'ol' : 'ul',
              { key, className: 'lr-note-doc-list', 'data-block': block.start },
              items.map((item, itemIndex) =>
                h(
                  'li',
                  { key: `${key}-${itemIndex}` },
                  ...renderNoteInline(item.inline, ctx, `${key}-${itemIndex}`),
                ),
              ),
            ),
          )
          return
        }
        if (block.type === 'code') {
          const base = notePlainIndex(ctx.projection, Number.isFinite(block.textStart) ? block.textStart : block.start)
          out.push(
            h(
              'pre',
              { key, className: 'lr-note-pre', 'data-block': block.start },
              h(
                'code',
                null,
                ...renderNoteRunsAt(block.text || '', base, ctx, `${key}-code`),
              ),
            ),
          )
          return
        }
        if (block.type === 'table') {
          const header = Array.isArray(block.header) ? block.header : []
          const rows = Array.isArray(block.rows) ? block.rows : []
          out.push(
            h(
              'div',
              { key, className: 'lr-note-table-wrap' },
              h(
                'table',
                { className: 'lr-note-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    header.map((cell, cellIndex) =>
                      h('th', { key: `${key}-h${cellIndex}` }, ...renderNoteInline(cell, ctx, `${key}-h${cellIndex}`)),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  rows.map((row, rowIndex) =>
                    h(
                      'tr',
                      { key: `${key}-r${rowIndex}` },
                      (row || []).map((cell, cellIndex) =>
                        h(
                          'td',
                          { key: `${key}-r${rowIndex}c${cellIndex}` },
                          ...renderNoteInline(cell, ctx, `${key}-r${rowIndex}c${cellIndex}`),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
          return
        }
        if (block.type === 'quote') {
          const callout = block.callout
          out.push(
            h(
              callout ? 'div' : 'blockquote',
              {
                key,
                className: callout
                  ? `lr-note-callout lr-note-callout-${String(callout.kind || 'note').replace(/[^a-z0-9_-]/gi, '')}`
                  : 'lr-note-quote',
                'data-block': block.start,
              },
              callout ? renderNoteCalloutHead(callout) : null,
              h(
                'div',
                { className: callout ? 'lr-note-callout-body' : 'lr-note-quote-body' },
                ...renderNoteBlocks(block.blocks, ctx, `${key}-q`),
              ),
            ),
          )
          return
        }
        if (block.type === 'hr') {
          out.push(h('hr', { key, className: 'lr-note-hr' }))
          return
        }
        if (block.type === 'image') {
          const next = blocks[index + 1]
          const nextInline = next && next.type === 'paragraph' && Array.isArray(next.inline) ? next.inline : []
          const captionIsNext = nextInline.length === 1 && nextInline[0] && nextInline[0].type === 'em'
          const src = resolveNoteFigureSrc(block.src, ctx.paperId)
          out.push(
            h(
              'figure',
              { key, className: 'lr-note-figure', 'data-block': block.start },
              h('img', {
                src,
                alt: block.alt || '',
                loading: 'lazy',
                onClick: (event) => {
                  event.stopPropagation()
                  ctx.onImage?.(src, block.alt || '')
                },
              }),
              block.alt && !captionIsNext ? h('figcaption', null, block.alt) : null,
            ),
          )
        }
      })
      return out
    }

    // Read-only document used by both the note view and the read-only previews.
    function MarkdownDoc({
      text,
      parsed: provided,
      paperId,
      annotations,
      onCite,
      onAnnPick,
      onImage,
      className = '',
    }) {
      // Callers that already parsed the text (the note view needs the
      // projection for selection mapping) pass it in; everyone else parses here.
      const own = useMemo(() => {
        if (provided) return null
        const result = parseMarkdown(text || '')
        const projection = plainProjection(result.blocks)
        return { blocks: result.blocks, projection }
      }, [provided, text])
      const parsed = provided || own
      const entries = useMemo(() => {
        const list = []
        const source = Array.isArray(annotations) ? annotations : []
        source.forEach((ann, index) => {
          if (!ann || ann.status === 'orphan') return
          const span = noteSourceToPlain(parsed.projection, Number(ann.start), Number(ann.end))
          if (!span) return
          list.push({ ann, number: index + 1, plainStart: span.start, plainEnd: span.end })
        })
        return list
      }, [annotations, parsed])
      const segments = useMemo(() => buildNoteSegments(entries), [entries])
      const ctx = {
        projection: parsed.projection,
        segments,
        paperId,
        onCite,
        onAnnPick,
        onImage,
      }
      return h('div', { className: `lr-note-doc ${className}`.trim() }, ...renderNoteBlocks(parsed.blocks, ctx))
    }

    function noteHeadings(blocks) {
      const out = []
      if (!Array.isArray(blocks)) return out
      for (const block of blocks) {
        if (!block) continue
        if (block.type === 'heading') {
          const text = (block.inline || []).map((item) => (item && item.text) || '').join('').trim()
          out.push({ level: block.level, text, start: block.start })
        }
      }
      return out
    }

    function noteWordCount(value) {
      return String(value || '').replace(/\s+/g, '').length
    }

    function noteFormatTime(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return String(iso)
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function noteExcerpt(value, limit) {
      const text = String(value || '').replace(/\s+/g, ' ').trim()
      if (text.length <= limit) return text
      return `${text.slice(0, limit)}…`
    }

    function noteMakeId() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
      } catch {
        // fall through to the timestamp id
      }
      return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }

    function noteDraftKey(paperId) {
      return `dsh.literature.noteDraft.${paperId}`
    }

    function readNoteDraft(paperId) {
      try {
        const raw = localStorage.getItem(noteDraftKey(paperId))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed.markdown !== 'string') return null
        return parsed
      } catch {
        return null
      }
    }

    function writeNoteDraft(paperId, draft) {
      try {
        localStorage.setItem(noteDraftKey(paperId), JSON.stringify(draft))
      } catch {
        // quota failures are harmless: the in-memory edit still works
      }
    }

    function clearNoteDraft(paperId) {
      try {
        localStorage.removeItem(noteDraftKey(paperId))
      } catch {
        // ignore storage failures
      }
    }



    // ── Reader note editing helpers (docs/reader-note-spec.md §7.3–§7.4) ────
    // Everything here is pure: no DOM, no fetch, no React state. The dock and
    // its tests both drive the same functions, so a shortcut cannot behave
    // differently from the toolbar button that shares its command.

    const READER_NOTE_DOCK_KEY = 'dsh.literature.noteDock.v1'
    const READER_NOTE_DOCK_MIN = 160
    const READER_NOTE_DOCK_DEFAULT = 260
    const READER_NOTE_FONT_MIN = 85
    const READER_NOTE_FONT_MAX = 180
    const READER_NOTE_DRAFT_LIMIT = 200 * 1024
    const READER_NOTE_DRAFT_DEBOUNCE = 400
    // One source of truth for the responsive switch: `@media(max-width:860px)`
    // in CSS must stay equal to this number (spec §14.1).
    const READER_NOTE_NARROW = 860

    function readerNoteDockHeight() {
      return storedNumber(READER_NOTE_DOCK_KEY, READER_NOTE_DOCK_DEFAULT, READER_NOTE_DOCK_MIN, 100000)
    }

    function storeReaderNoteDockHeight(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return
      const clamped = Math.max(READER_NOTE_DOCK_MIN, Math.round(number))
      try {
        localStorage.setItem(READER_NOTE_DOCK_KEY, String(clamped))
      } catch {
        // a full quota must not break the drag
      }
    }

    // Text size (spec §7.2): 85%–180%, steps of 5, so every stop is reachable
    // from both the keyboard and the ± buttons.
    function clampReaderNoteFont(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return 100
      return Math.max(READER_NOTE_FONT_MIN, Math.min(READER_NOTE_FONT_MAX, Math.round(number)))
    }

    function stepReaderNoteFont(value, direction) {
      return clampReaderNoteFont(clampReaderNoteFont(value) + (direction < 0 ? -5 : 5))
    }

    /** `t(key)` with `{placeholder}` substitution (`{count}`, `{path}`, …). */
    function readerNoteText(key, values) {
      let output = t(key)
      if (!values) return output
      for (const [name, value] of Object.entries(values)) {
        output = output.split(`{${name}}`).join(String(value))
      }
      return output
    }

    /**
     * Draft per paper, kept apart from the summary editor's draft so a note
     * draft can never leak into the summary editor (and vice versa).
     */
    function readerNoteDraftKey(paperId) {
      return `dsh.literature.noteDraft.${paperId}.v1`
    }

    function readReaderNoteDraft(paperId) {
      if (!paperId) return ''
      try {
        const raw = localStorage.getItem(readerNoteDraftKey(paperId))
        return typeof raw === 'string' ? raw : ''
      } catch {
        return ''
      }
    }

    function writeReaderNoteDraft(paperId, markdown) {
      if (!paperId) return
      const text = typeof markdown === 'string' ? markdown : ''
      try {
        if (!text.trim()) {
          localStorage.removeItem(readerNoteDraftKey(paperId))
          return
        }
        // Keep the last editable slice rather than throwing the draft away.
        const slice = text.length > READER_NOTE_DRAFT_LIMIT ? text.slice(0, READER_NOTE_DRAFT_LIMIT) : text
        localStorage.setItem(readerNoteDraftKey(paperId), slice)
      } catch {
        // quota failures are harmless: the in-memory edit still works
      }
    }

    function clearReaderNoteDraft(paperId) {
      if (!paperId) return
      try {
        localStorage.removeItem(readerNoteDraftKey(paperId))
      } catch {
        // ignore storage failures
      }
    }

    // Wrap a selection in `marker` on both sides, or unwrap it when the
    // selection (or the text just outside it) already carries that marker.
    function readerNoteWrap(text, start, end, marker) {
      const value = String(text || '')
      const from = Math.max(0, Math.min(value.length, Number(start) || 0))
      const to = Math.max(from, Math.min(value.length, Number(end) || 0))
      const inner = value.slice(from, to)
      const size = marker.length
      const openAt = from - size
      // Selection includes the markers: drop them.
      if (inner.length >= size * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
        const stripped = inner.slice(size, inner.length - size)
        return {
          text: value.slice(0, from) + stripped + value.slice(to),
          start: from,
          end: from + stripped.length,
        }
      }
      // Markers sit just outside the selection: drop them too.
      if (openAt >= 0 && value.slice(openAt, from) === marker && value.slice(to, to + size) === marker) {
        return {
          text: value.slice(0, openAt) + inner + value.slice(to + size),
          start: openAt,
          end: openAt + inner.length,
        }
      }
      return {
        text: value.slice(0, from) + marker + inner + marker + value.slice(to),
        start: from + size,
        end: from + size + inner.length,
      }
    }

    // Line-prefix commands (headings, lists, quotes) toggle: applying the same
    // prefix twice removes it, and 恢复正文 strips every recognised prefix.
    const READER_NOTE_LINE_PREFIXES = [
      { command: 'h1', prefix: '# ' },
      { command: 'h2', prefix: '## ' },
      { command: 'h3', prefix: '### ' },
      { command: 'ul', prefix: '- ' },
      { command: 'ol', prefix: '1. ' },
      { command: 'quote', prefix: '> ' },
    ]
    const READER_NOTE_ANY_PREFIX_RE = /^(?:#{1,6} |> |- |\d{1,9}[.)] )/

    function readerNoteLinePrefix(text, start, end, command) {
      const value = String(text || '')
      const from = Math.max(0, Math.min(value.length, Number(start) || 0))
      const to = Math.max(from, Math.min(value.length, Number(end) || 0))
      const lineStart = value.lastIndexOf('\n', from - 1) + 1
      // `end` may sit exactly on a newline; stay on the previous line then.
      const scanFrom = to > from && value[to - 1] === '\n' ? to - 1 : to
      const nextBreak = value.indexOf('\n', scanFrom)
      const lineEnd = nextBreak === -1 ? value.length : nextBreak
      const block = value.slice(lineStart, lineEnd)
      const lines = block.split('\n')
      const target = READER_NOTE_LINE_PREFIXES.find((item) => item.command === command)
      const stripAny = command === 'body'
      let delta = 0
      let firstStart = 0
      let firstEnd = 0
      let seen = 0
      const next = lines.map((line) => {
        const prefix = stripAny
          ? (READER_NOTE_ANY_PREFIX_RE.exec(line) || [''])[0]
          : target && line.startsWith(target.prefix) ? target.prefix : ''
        const content = prefix ? line.slice(prefix.length) : line
        const applied = stripAny || !target ? '' : prefix ? '' : target.prefix
        const body = prefix ? content : line
        const out = `${applied}${body}`
        if (seen === 0) {
          firstStart = delta
          firstEnd = delta + out.length
        }
        seen += 1
        delta += out.length + 1
        return out
      })
      const replaced = next.join('\n')
      return {
        text: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
        start: lineStart + firstStart,
        end: lineStart + firstEnd,
      }
    }

    function readerNoteInsertLink(text, start, end) {
      const value = String(text || '')
      const from = Math.max(0, Math.min(value.length, Number(start) || 0))
      const to = Math.max(from, Math.min(value.length, Number(end) || 0))
      const inner = value.slice(from, to)
      // A selection that is already a link unwraps back to its label.
      const existing = /^\[([^\]]*)\]\([^)]*\)$/.exec(inner)
      if (existing) {
        return { text: value.slice(0, from) + existing[1] + value.slice(to), start: from, end: from + existing[1].length }
      }
      const snippet = `[${inner}]()`
      // With a selection the label is done, so the caret belongs in the URL
      // slot; with none it belongs between the brackets, ready for the label.
      const caret = inner ? from + 1 + inner.length + 2 : from + 1
      return { text: value.slice(0, from) + snippet + value.slice(to), start: caret, end: caret }
    }

    /**
     * Apply one editing command to `text` and return the new value plus the
     * selection the textarea should carry afterwards.
     * @param {{text:string,start:number,end:number,command:string}} input
     * @returns {{text:string,start:number,end:number}}
     */
    function applyMarkdownCommand(input) {
      const value = typeof input?.text === 'string' ? input.text : ''
      const start = Number.isFinite(input?.start) ? input.start : 0
      const end = Number.isFinite(input?.end) ? input.end : start
      const command = typeof input?.command === 'string' ? input.command : ''
      switch (command) {
        case 'bold':
          return readerNoteWrap(value, start, end, '**')
        case 'italic':
          return readerNoteWrap(value, start, end, '*')
        case 'code':
          return readerNoteWrap(value, start, end, '`')
        case 'math':
          return readerNoteWrap(value, start, end, '$')
        case 'mathBlock':
          return readerNoteWrap(value, start, end, '$$')
        case 'link':
          return readerNoteInsertLink(value, start, end)
        case 'h1':
        case 'h2':
        case 'h3':
        case 'ul':
        case 'ol':
        case 'quote':
        case 'body':
          return readerNoteLinePrefix(value, start, end, command)
        default:
          return { text: value, start, end }
      }
    }

    /**
     * One keydown -> one command. Returns null when the event is not ours, so
     * the textarea keeps its native behaviour (typing, plain Enter, …).
     * macOS reports `metaKey`; the spec makes Cmd equivalent to Ctrl.
     * @returns {{command:string}|{action:string}|null}
     */
    function readerNoteCommandForKey(event) {
      if (!event || event.altKey) return null
      const mod = event.ctrlKey || event.metaKey
      const key = typeof event.key === 'string' ? event.key : ''
      if (!mod) return event.key === 'Escape' ? { action: 'close' } : null
      if (event.key === 'Enter') return { action: 'submit' }
      const lower = key.toLowerCase()
      if (event.shiftKey) {
        if (lower === '8') return { command: 'ul' }
        if (lower === '7') return { command: 'ol' }
        if (lower === 'q') return { command: 'quote' }
        // Ctrl+Shift+` — the backtick key reports different codes per layout.
        if (key === '`' || key === '~' || event.code === 'Backquote') return { command: 'code' }
        if (lower === 'm') return { command: 'mathBlock' }
        if (lower === 'i') return { command: 'image' }
        if (key === '0') return { action: 'fontReset' }
        if (key === '=' || key === '+' || event.code === 'Equal') return { action: 'fontUp' }
        if (key === '-' || key === '_' || event.code === 'Minus') return { action: 'fontDown' }
        return null
      }
      if (lower === 'b') return { command: 'bold' }
      if (lower === 'i') return { command: 'italic' }
      if (lower === 'k') return { command: 'link' }
      if (lower === 'm') return { command: 'math' }
      if (key === '1') return { command: 'h1' }
      if (key === '2') return { command: 'h2' }
      if (key === '3') return { command: 'h3' }
      if (key === '0') return { command: 'body' }
      // Ctrl+= / Ctrl+- zoom the text size, not the browser (spec §7.3).
      if (key === '=' || key === '+' || event.code === 'Equal') return { action: 'fontUp' }
      if (key === '-' || key === '_' || event.code === 'Minus') return { action: 'fontDown' }
      return null
    }

    // ── Math rendering (spec §7.4): offline, no library ─────────────────────
    const MATH_GREEK = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
      iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ',
      sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
      Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Iota: 'Ι', Kappa: 'Κ',
      Mu: 'Μ', Nu: 'Ν', Omicron: 'Ο', Rho: 'Ρ', Tau: 'Τ', Chi: 'Χ', Beta: 'Β',
    }
    const MATH_SYMBOLS = {
      sum: '∑', prod: '∏', int: '∫', oint: '∮', infin: '∞', infty: '∞', partial: '∂', nabla: '∇',
      times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥',
      ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝', to: '→', rightarrow: '→',
      Rightarrow: '⇒', leftarrow: '←', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔',
      mapsto: '↦', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩',
      forall: '∀', exists: '∃', emptyset: '∅', angle: '∠', degree: '°', prime: '′',
      ldots: '…', cdots: '⋯', dots: '…', therefore: '∴', because: '∵',
      ' ': ' ', ',': '\u2009', ';': '\u2005', ':': '\u2005', '!': '',
      quad: '\u2003', qquad: '\u2003\u2003',
    }
    const MATH_FUNCTIONS = new Set([
      'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
      'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'deg', 'gcd',
      'arg', 'mod', 'bmod',
    ])

    /**
     * Split `source` into tokens (`\cmd`, `{`, `}`, `_`, `^`, `&`, chars).
     * Unknown commands stay as a `cmd` token; the renderer prints them
     * verbatim in monospace instead of swallowing them.
     */
    function mathTokens(source) {
      const text = typeof source === 'string' ? source : ''
      const tokens = []
      let index = 0
      while (index < text.length) {
        const char = text[index]
        if (char === '\\') {
          let end = index + 1
          if (end < text.length && /[A-Za-z]/.test(text[end])) {
            while (end < text.length && /[A-Za-z]/.test(text[end])) end += 1
            tokens.push({ type: 'cmd', value: text.slice(index + 1, end) })
            // TeX swallows the whitespace that terminates a control word, so
            // `\quad x` is one space and `\alpha \beta` is two letters.
            while (end < text.length && /\s/.test(text[end])) end += 1
            index = end
            continue
          }
          // Control symbol such as `\,`, `\;`, `\{`, `\\`.
          tokens.push({ type: 'cmd', value: text.slice(index + 1, index + 2) })
          index += 2
          continue
        }
        if (char === '{' || char === '}' || char === '_' || char === '^' || char === '&') {
          tokens.push({ type: char })
          index += 1
          continue
        }
        if (/\s/.test(char)) {
          // Whitespace is significant only as a word break in text mode.
          let end = index
          while (end < text.length && /\s/.test(text[end])) end += 1
          tokens.push({ type: 'space', value: text.slice(index, end) })
          index = end
          continue
        }
        tokens.push({ type: 'char', value: char })
        index += 1
      }
      return tokens
    }

    /**
     * Turn a math fragment into a flat list of render nodes. The parser is a
     * deliberately small recursive reader: scripts bind to the previous atom,
     * `\frac`/`\sqrt`/`\text`/`\left` take braced groups, and everything else
     * degrades to the raw command text.
     */
    function mathParse(source) {
      const tokens = mathTokens(source)
      let position = 0

      const peek = () => tokens[position]
      const next = () => tokens[position++]

      function parseGroup() {
        const token = peek()
        if (!token) return []
        if (token.type === '{') {
          next()
          const nodes = parseNodes(() => peek()?.type === '}')
          if (peek()?.type === '}') next()
          return nodes
        }
        if (token.type === 'cmd') {
          next()
          return [mathCommandNode(token.value, null)]
        }
        next()
        return [mathAtomNode(token)]
      }

      function mathAtomNode(token) {
        if (!token) return null
        if (token.type === 'char') return { type: 'text', value: token.value }
        if (token.type === 'space') return { type: 'text', value: ' ' }
        if (token.type === '&') return { type: 'text', value: '\u2003' }
        if (token.type === 'cmd') return mathCommandNode(token.value, null)
        return null
      }

      function mathCommandNode(name, argument) {
        const greek = MATH_GREEK[name]
        if (greek !== undefined) return { type: 'text', value: greek }
        if (Object.prototype.hasOwnProperty.call(MATH_SYMBOLS, name)) {
          return { type: 'text', value: MATH_SYMBOLS[name] }
        }
        if (MATH_FUNCTIONS.has(name)) return { type: 'func', value: name }
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const numerator = parseGroup()
          const denominator = parseGroup()
          return { type: 'frac', numerator, denominator }
        }
        if (name === 'sqrt') {
          // Optional index: \sqrt[3]{x}
          let index = null
          if (peek()?.type === 'char' && peek().value === '[') {
            next()
            const inner = []
            while (peek() && !(peek().type === 'char' && peek().value === ']')) {
              const token = next()
              if (token.type === 'char') inner.push({ type: 'text', value: token.value })
              else if (token.type === 'space') inner.push({ type: 'text', value: ' ' })
              else inner.push(mathAtomNode(token))
            }
            if (peek()) next()
            index = inner
          }
          return { type: 'sqrt', index, body: parseGroup() }
        }
        if (name === 'text' || name === 'mathrm' || name === 'operatorname' || name === 'textbf' || name === 'mbox') {
          const body = parseGroup()
          return { type: 'text-run', body }
        }
        if (name === 'left' || name === 'right') {
          const token = next()
          if (!token) return { type: 'text', value: '' }
          if (token.type === 'cmd') {
            const symbol = MATH_SYMBOLS[token.value] ?? MATH_SYMBOLS[token.value === 'vert' ? '|' : token.value]
            return { type: 'text', value: symbol !== undefined ? symbol : `\\${token.value}` }
          }
          if (token.type === 'char') {
            if (token.value === '.') return { type: 'text', value: '' }
            return { type: 'text', value: token.value }
          }
          return { type: 'text', value: '' }
        }
        if (name === 'begin' || name === 'end') {
          const body = parseGroup()
          const groupName = body.map((node) => node.value || '').join('')
          return { type: name === 'begin' ? 'env-begin' : 'env-end', name: groupName }
        }
        if (name === '\\') return { type: 'break' }
        return { type: 'unknown', value: `\\${name}` }
      }

      function parseNodes(isEnd) {
        const nodes = []
        while (position < tokens.length) {
          if (isEnd && isEnd()) break
          const token = peek()
          if (token.type === '_' || token.type === '^') {
            next()
            const script = parseGroup()
            const base = nodes.length > 0 ? nodes.pop() : { type: 'text', value: '' }
            const existing = base.type === 'script' ? base : null
            const merged = existing || { type: 'script', base, sub: null, sup: null }
            if (token.type === '_') merged.sub = script
            else merged.sup = script
            nodes.push(merged)
            continue
          }
          if (token.type === '}') {
            next()
            continue
          }
          if (token.type === 'cmd') {
            next()
            nodes.push(mathCommandNode(token.value, null))
            continue
          }
          next()
          nodes.push(mathAtomNode(token))
        }
        return nodes
      }

      const nodes = parseNodes(null)
      return nodes
    }

    // A math node tree -> React children. `key` prefixes every node so React
    // never complains about a bare list.
    function renderMathNodes(nodes, prefix) {
      const out = []
      const list = Array.isArray(nodes) ? nodes : []
      list.forEach((node, index) => {
        const key = `${prefix}-${index}`
        if (!node) return
        switch (node.type) {
          case 'text':
            out.push(node.value)
            return
          case 'func':
            out.push(h('span', { key, className: 'lr-math-func' }, node.value))
            return
          case 'unknown':
            // Never throw, never swallow: show the command as it was written.
            out.push(h('code', { key, className: 'lr-math-unknown' }, node.value))
            return
          case 'break':
            out.push(h('br', { key }))
            return
          case 'frac':
            out.push(
              h(
                'span',
                { key, className: 'lr-math-frac' },
                h('span', { className: 'lr-math-num' }, ...renderMathNodes(node.numerator, `${key}-n`)),
                h('span', { className: 'lr-math-den' }, ...renderMathNodes(node.denominator, `${key}-d`)),
              ),
            )
            return
          case 'sqrt':
            out.push(
              h(
                'span',
                { key, className: 'lr-math-sqrt' },
                node.index
                  ? h('span', { className: 'lr-math-sqrt-index' }, ...renderMathNodes(node.index, `${key}-i`))
                  : null,
                h('span', { className: 'lr-math-radical' }, '√'),
                h('span', { className: 'lr-math-sqrt-body' }, ...renderMathNodes(node.body, `${key}-b`)),
              ),
            )
            return
          case 'script':
            out.push(
              h(
                'span',
                { key, className: 'lr-math-script' },
                ...renderMathNodes([node.base], `${key}-b`),
                node.sub ? h('sub', { className: 'lr-math-sub' }, ...renderMathNodes(node.sub, `${key}-s`)) : null,
                node.sup ? h('sup', { className: 'lr-math-sup' }, ...renderMathNodes(node.sup, `${key}-p`)) : null,
              ),
            )
            return
          case 'text-run':
            out.push(h('span', { key, className: 'lr-math-text' }, ...renderMathNodes(node.body, `${key}-t`)))
            return
          case 'env-begin':
          case 'env-end':
            // `\begin{aligned}` and friends only contribute structure; the
            // display container already stacks the `\\` breaks.
            return
          default:
            out.push(h('code', { key, className: 'lr-math-unknown' }, String(node.value || '')))
        }
      })
      return out
    }

    /**
     * Render `$…$`/`$$…$$` content as React nodes (spec §7.4).
     * @param {string} source
     * @param {{display?:boolean}} [options]
     */
    function renderMath(source, options) {
      const display = Boolean(options?.display)
      const text = typeof source === 'string' ? source : ''
      // `\begin{aligned} … \\ … \end{aligned}` becomes stacked rows.
      const rows = []
      let parsed
      try {
        parsed = mathParse(text)
      } catch {
        parsed = [{ type: 'unknown', value: text }]
      }
      let current = []
      for (const node of parsed) {
        if (node && node.type === 'break') {
          rows.push(current)
          current = []
        } else {
          current.push(node)
        }
      }
      rows.push(current)
      const body = []
      rows.forEach((row, index) => {
        if (index > 0) body.push(h('br', { key: `math-br-${index}` }))
        body.push(...renderMathNodes(row, `math-${index}`))
      })
      return h(
        display ? 'div' : 'span',
        { className: `lr-math ${display ? 'lr-math-display' : 'lr-math-inline'}` },
        ...body,
      )
    }

    /**
     * Split one text run into plain text and `$…$` math segments. `$$…$$` is
     * display maths and must stand on its own line. Returns `null` when the
     * run has no maths at all, so callers can keep the plain string.
     */
    function splitMathSegments(text) {
      const value = typeof text === 'string' ? text : ''
      if (value.indexOf('$') === -1) return null
      const out = []
      let last = 0
      let index = 0
      while (index < value.length) {
        const char = value[index]
        if (char === '\\') {
          index += 2
          continue
        }
        if (char !== '$') {
          index += 1
          continue
        }
        const display = value[index + 1] === '$'
        const marker = display ? '$$' : '$'
        const open = index
        let cursor = index + marker.length
        let close = -1
        while (cursor < value.length) {
          const inner = value[cursor]
          if (inner === '\\') {
            cursor += 2
            continue
          }
          if (inner === '$') {
            if (display) {
              if (value[cursor + 1] === '$') {
                close = cursor
                break
              }
              cursor += 1
              continue
            }
            close = cursor
            break
          }
          cursor += 1
        }
        if (close === -1) {
          // Unbalanced: leave the rest as plain text.
          break
        }
        const source = value.slice(open + marker.length, close)
        if (open > last) out.push({ type: 'text', value: value.slice(last, open) })
        out.push({ type: 'math', source, display })
        index = close + marker.length
        last = index
      }
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
      const hasMath = out.some((item) => item.type === 'math')
      return hasMath ? out : null
    }

    // Plain range covered by a DOM selection inside the note document. The two
    // endpoints normally resolve through data-p; a selection that ends on a
    // wrapper element (e.g. after dragging over a whole list) falls back to the
    // intersected mapped spans.
    function noteSelectionSpan(container, range) {
      if (!container || !range) return null
      let from = notePlainOffsetAt(range.startContainer, range.startOffset)
      let to = notePlainOffsetAt(range.endContainer, range.endOffset)
      if (from == null || to == null || to <= from) {
        const spans = container.querySelectorAll('[data-p]')
        let low = Infinity
        let high = -Infinity
        for (const span of spans) {
          if (!range.intersectsNode || range.intersectsNode(span)) {
            const base = Number(span.getAttribute('data-p'))
            if (!Number.isFinite(base)) continue
            low = Math.min(low, base)
            high = Math.max(high, base + String(span.textContent || '').length)
          }
        }
        if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null
        from = low
        to = high
      }
      return { from, to }
    }

    function NoteLightbox({ image, onClose }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      if (!image) return null
      return h(
        'div',
        {
          className: 'lr-note-lightbox',
          role: 'dialog',
          'aria-modal': 'true',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose?.()
          },
        },
        h('img', { src: image.src, alt: image.alt || '' }),
        h(
          'button',
          { type: 'button', className: 'lr-note-lightbox-close', onClick: onClose, 'aria-label': t('close') },
          h(Icon, { name: 'close', size: 16 }),
        ),
      )
    }

    function NoteColorPicker({ value, onChange, compact = false }) {
      return h(
        'div',
        { className: `lr-ann-colors${compact ? ' compact' : ''}`, role: 'radiogroup', 'aria-label': t('noteAnnColor') },
        NOTE_COLORS.map((color) =>
          h(
            'button',
            {
              key: color,
              type: 'button',
              className: `lr-ann-color lr-ann-color-${color}${value === color ? ' active' : ''}`,
              role: 'radio',
              'aria-checked': value === color,
              title: noteColorLabel(color),
              onClick: () => onChange?.(color),
            },
          ),
        ),
      )
    }

    // Confirm which uncertain vocabulary terms belong in the glossary. The
    // selection is local state; the parent owns the generate decision, so
    // closing/cancelling here simply never calls the SSE endpoint.
    function GlossaryConfirmDialog({ questions, includeCount, onConfirm, onClose }) {
      const [checked, setChecked] = useState(() =>
        (questions || []).map((item) => item.guess !== false),
      )
      if (!questions || questions.length === 0) return null
      const allOn = checked.every(Boolean)
      const toggle = (index) => {
        setChecked((current) => current.map((value, i) => (i === index ? !value : value)))
      }
      const confirm = () => {
        const picked = questions.filter((item, index) => checked[index])
        onConfirm?.(picked)
      }
      return h(
        Modal,
        {
          title: t('glossaryTitle'),
          subtitle: t('glossaryIntro'),
          onClose,
        },
        h(
          'div',
          { className: 'lr-glossary' },
          h(
            'div',
            { className: 'lr-glossary-tools' },
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn small',
                onClick: () => setChecked((current) => current.map(() => true)),
                disabled: allOn,
              },
              t('glossarySelectAll'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn small',
                onClick: () => setChecked((current) => current.map(() => false)),
                disabled: checked.every((value) => !value),
              },
              t('glossarySelectNone'),
            ),
            includeCount > 0
              ? h(
                  'span',
                  { className: 'lr-glossary-count' },
                  t('glossaryIncluded').split('{count}').join(String(includeCount)),
                )
              : null,
          ),
          h(
            'div',
            { className: 'lr-glossary-list' },
            questions.map((item, index) =>
              h(
                'label',
                { key: `${item.term}-${index}`, className: `lr-glossary-row${checked[index] ? ' checked' : ''}` },
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(checked[index]),
                  onChange: () => toggle(index),
                }),
                h('span', { className: 'lr-glossary-term' }, item.term || ''),
                item.translation
                  ? h('span', { className: 'lr-glossary-trans' }, `— ${item.translation}`)
                  : null,
              ),
            ),
          ),
          h(
            'div',
            { className: 'lr-glossary-actions' },
            h(
              'button',
              { type: 'button', className: 'lr-btn', onClick: onClose },
              t('glossaryCancel'),
            ),
            h(
              'button',
              { type: 'button', className: 'lr-btn primary', onClick: confirm },
              h(Icon, { name: 'sparkle', size: 13 }),
              t('glossaryStart'),
            ),
          ),
        ),
      )
    }

    // Floating "标注" button shown after a text selection.
    function NoteSelectionToolbar({ toolbar, onAnnotate, onDismiss }) {
      if (!toolbar) return null
      return h(
        'div',
        {
          className: 'lr-ann-toolbar',
          style: { left: `${toolbar.left}px`, top: `${toolbar.top}px` },
          onMouseDown: (event) => event.preventDefault(),
        },
        h(
          'button',
          { type: 'button', className: 'lr-ann-toolbar-btn primary', onClick: onAnnotate },
          h(Icon, { name: 'quote', size: 12 }),
          t('noteAnnotate'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lr-ann-toolbar-close',
            onClick: onDismiss,
            'aria-label': t('close'),
          },
          h(Icon, { name: 'close', size: 11 }),
        ),
      )
    }

    // Create/edit one annotation. Saving never touches the document body.
    function NoteAnnotationDialog({ draft, onSave, onDelete, onClose, onLocate }) {
      const [note, setNote] = useState(draft?.note || '')
      const [color, setColor] = useState(draft?.color || 'amber')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const areaRef = useRef(null)
      useEffect(() => {
        const timer = setTimeout(() => areaRef.current?.focus(), 40)
        return () => clearTimeout(timer)
      }, [])
      const submit = async () => {
        if (busy) return
        if (!note.trim() && !draft?.id) {
          setError(t('noteAnnNeedNote'))
          return
        }
        setBusy(true)
        setError('')
        try {
          await onSave({ ...draft, note: note.trim(), color })
          setBusy(false)
        } catch (saveError) {
          setError(safeError(saveError) || t('noteAnnSaveFailed'))
          setBusy(false)
        }
      }
      const remove = async () => {
        if (busy || !draft?.id) return
        setBusy(true)
        try {
          await onDelete(draft.id)
        } catch (deleteError) {
          setError(safeError(deleteError) || t('noteAnnSaveFailed'))
          setBusy(false)
        }
      }
      return h(
        Modal,
        { title: draft?.id ? t('noteAnnEdit') : t('noteAnnotate'), onClose: busy ? () => {} : onClose },
        h(
          'div',
          { className: 'lr-ann-dialog' },
          h('div', { className: 'lr-ann-quote-box' }, noteExcerpt(draft?.quote || '', 220) || t('noteAnnSelectFirst')),
          h(
            'textarea',
            {
              ref: areaRef,
              className: 'lr-ann-input',
              value: note,
              rows: 4,
              placeholder: t('noteAnnPlaceholder'),
              onChange: (event) => setNote(event.target.value),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              },
            },
          ),
          h(
            'div',
            { className: 'lr-ann-dialog-row' },
            h('span', { className: 'lr-ann-label' }, t('noteAnnColor')),
            h(NoteColorPicker, { value: color, onChange: setColor }),
          ),
          draft?.reply
            ? h('div', { className: 'lr-ann-reply' }, `${t('noteAnnReply')}：${draft.reply}`)
            : null,
          error ? h('div', { className: 'lr-ann-error' }, error) : null,
          h(
            'div',
            { className: 'lr-ann-dialog-actions' },
            draft?.id && onLocate
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn small',
                    onClick: () => {
                      onLocate?.(draft.id)
                    },
                  },
                  h(Icon, { name: 'target', size: 12 }),
                  t('noteAnnLocate'),
                )
              : null,
            draft?.id
              ? h(
                  'button',
                  { type: 'button', className: 'lr-btn small danger', onClick: remove, disabled: busy },
                  h(Icon, { name: 'trash', size: 12 }),
                  t('noteAnnDelete'),
                )
              : null,
            h('span', { className: 'lr-ann-spacer' }),
            h('button', { type: 'button', className: 'lr-btn', onClick: onClose, disabled: busy }, t('cancel')),
            h(
              'button',
              { type: 'button', className: 'lr-btn primary', onClick: submit, disabled: busy },
              busy ? h(Spinner, { size: 12 }) : h(Icon, { name: 'check', size: 13 }),
              t('noteAnnSave'),
            ),
          ),
          h('div', { className: 'lr-ann-hint' }, t('noteAnnShortcut')),
        ),
      )
    }

    function NoteAnnotationGroup({ title, items, collapsed, onToggle, onLocate, onEdit, onDelete }) {
      if (items.length === 0) return null
      return h(
        'div',
        { className: `lr-ann-group${collapsed ? ' collapsed' : ''}` },
        h(
          'button',
          { type: 'button', className: 'lr-ann-group-head', onClick: onToggle },
          h(Icon, { name: 'chevronRight', size: 11 }),
          h('span', null, title),
          h('span', { className: 'lr-ann-group-count' }, String(items.length)),
        ),
        collapsed
          ? null
          : h(
              'div',
              { className: 'lr-ann-group-body' },
              items.map(({ ann, number }) =>
                h(
                  'div',
                  { key: ann.id, className: `lr-ann-item lr-ann-item-${ann.status || 'open'}` },
                  h('span', { className: `lr-ann-badge lr-ann-seq-${ann.color || 'amber'}` }, String(number)),
                  h(
                    'div',
                    { className: 'lr-ann-item-main' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-ann-item-quote',
                        onClick: () => onLocate?.(ann.id),
                        title: ann.quote,
                      },
                      noteExcerpt(ann.quote, 80),
                    ),
                    ann.note ? h('div', { className: 'lr-ann-item-note' }, ann.note) : null,
                    ann.reply
                      ? h('div', { className: 'lr-ann-item-reply' }, `${t('noteAnnReply')}：${ann.reply}`)
                      : null,
                  ),
                  h(
                    'div',
                    { className: 'lr-ann-item-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-btn icon small',
                        title: t('noteAnnLocate'),
                        onClick: () => onLocate?.(ann.id),
                      },
                      h(Icon, { name: 'target', size: 12 }),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-btn icon small',
                        title: t('noteAnnEdit'),
                        onClick: () => onEdit?.(ann.id),
                      },
                      h(Icon, { name: 'pen', size: 12 }),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-btn icon small danger',
                        title: t('noteAnnDelete'),
                        onClick: () => onDelete?.(ann.id),
                      },
                      h(Icon, { name: 'trash', size: 12 }),
                    ),
                  ),
                ),
              ),
            ),
      )
    }

    function NoteAnnotationPanel({
      annotations,
      open,
      collapsed,
      onToggle,
      onClose,
      onLocate,
      onEdit,
      onDelete,
    }) {
      const groups = { open: [], resolved: [], orphan: [] }
      annotations.forEach((ann, index) => {
        const key = ann.status === 'resolved' ? 'resolved' : ann.status === 'orphan' ? 'orphan' : 'open'
        groups[key].push({ ann, number: index + 1 })
      })
      const [folded, setFolded] = useState({ resolved: true, orphan: false })
      const total = annotations.length
      const allFolded = Boolean(folded.open && folded.resolved && folded.orphan)
      return h(
        'aside',
        {
          className: `lr-ann-panel${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`,
          'aria-label': t('noteAnnCount'),
        },
        h(
          'div',
          { className: 'lr-ann-panel-head' },
          h(Icon, { name: 'quote', size: 14 }),
          h('span', { className: 'lr-ann-panel-title' }, `${t('noteAnnCount')} · ${total}`),
          h(
            'button',
            {
              type: 'button',
              className: 'lr-btn icon small',
              title: allFolded ? t('noteAnnExpandAll') : t('noteAnnCollapseAll'),
              onClick: () =>
                setFolded(
                  allFolded ? { open: false, resolved: false, orphan: false } : { open: true, resolved: true, orphan: true },
                ),
            },
            h(Icon, { name: allFolded ? 'list' : 'minus', size: 12 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'lr-btn icon small lr-ann-panel-close',
              title: t('close'),
              onClick: onClose,
            },
            h(Icon, { name: 'close', size: 12 }),
          ),
        ),
        total === 0
          ? h(
              'div',
              { className: 'lr-ann-empty' },
              h(Icon, { name: 'quote', size: 18 }),
              h('div', null, t('noteAnnEmpty')),
              h('div', { className: 'lr-ann-empty-hint' }, t('noteAnnEmptyHint')),
            )
          : h(
              'div',
              { className: 'lr-ann-panel-body' },
              h(NoteAnnotationGroup, {
                title: t('noteAnnOpen'),
                items: groups.open,
                collapsed: Boolean(folded.open),
                onToggle: () => setFolded((value) => ({ ...value, open: !value.open })),
                onLocate,
                onEdit,
                onDelete,
              }),
              h(NoteAnnotationGroup, {
                title: t('noteAnnResolved'),
                items: groups.resolved,
                collapsed: Boolean(folded.resolved),
                onToggle: () => setFolded((value) => ({ ...value, resolved: !value.resolved })),
                onLocate,
                onEdit,
                onDelete,
              }),
              h(NoteAnnotationGroup, {
                title: t('noteAnnOrphan'),
                items: groups.orphan,
                collapsed: Boolean(folded.orphan),
                onToggle: () => setFolded((value) => ({ ...value, orphan: !value.orphan })),
                onLocate,
                onEdit,
                onDelete,
              }),
            ),
      )
    }

    function NoteApplyBar({
      pendingCount,
      running,
      label,
      instruction,
      onInstruction,
      onApply,
      onOpenPanel,
      orphanCount,
      disabled,
    }) {
      return h(
        'div',
        { className: `lr-note-applybar${running ? ' running' : ''}` },
        h(
          'div',
          { className: 'lr-note-applybar-info' },
          h(
            'button',
            {
              type: 'button',
              className: 'lr-note-applybar-count',
              onClick: onOpenPanel,
              title: t('noteAnnCount'),
            },
            h(Icon, { name: 'quote', size: 13 }),
            t('noteApplyPending').split('{count}').join(String(pendingCount)),
          ),
          h('span', { className: 'lr-note-applybar-hint' }, running ? label || t('noteApplying') : t('noteApplyHint')),
          orphanCount > 0 ? h('span', { className: 'lr-note-applybar-warn' }, `${t('noteAnnOrphan')} ${orphanCount}`) : null,
        ),
        h('input', {
          className: 'lr-note-applybar-input',
          value: instruction,
          placeholder: t('noteApplyInstruction'),
          disabled: running || disabled,
          onChange: (event) => onInstruction(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !running) {
              event.preventDefault()
              onApply?.()
            }
          },
          'aria-label': t('noteApplyInstruction'),
        }),
        h(
          'button',
          {
            type: 'button',
            className: 'lr-btn primary lr-note-apply-btn',
            onClick: onApply,
            disabled: running || disabled || (pendingCount === 0 && !String(instruction || '').trim()),
            title: t('noteApply'),
          },
          running ? h(Spinner, { size: 13 }) : h(Icon, { name: 'sparkle', size: 14 }),
          running ? label || t('noteApplying') : t('noteApply'),
        ),
      )
    }

    function NoteEditor({ value, onChange, onSave, onCancel, dirty, saving, error, draftOffer, onRestoreDraft, onDiscardDraft, onInsertImage, onCursor }) {
      const areaRef = useRef(null)
      const reportCursor = (area) => {
        if (area && typeof onCursor === 'function') onCursor(area.selectionStart)
      }
      useEffect(() => {
        const area = areaRef.current
        if (!area) return
        area.focus()
        const end = area.value.length
        try {
          area.setSelectionRange(end, end)
        } catch {
          // ignore selection failures on readonly nodes
        }
      }, [])
      return h(
        'div',
        { className: 'lr-note-editor' },
        h(
          'div',
          { className: 'lr-note-editor-bar' },
          h(
            'button',
            { type: 'button', className: 'lr-btn small primary', onClick: onSave, disabled: saving || !dirty },
            saving ? h(Spinner, { size: 12 }) : h(Icon, { name: 'check', size: 13 }),
            dirty ? t('save') : t('noteSaved'),
          ),
          h(
            'button',
            { type: 'button', className: 'lr-btn small', onClick: onCancel, disabled: saving },
            t('noteEditorCancel'),
          ),
          h('span', { className: 'lr-note-editor-words' }, t('noteEditorWords').split('{count}').join(String(noteWordCount(value)))),
          h('span', { className: 'lr-ann-spacer' }),
          h(
            'button',
            { type: 'button', className: 'lr-btn small', onClick: onInsertImage, disabled: saving },
            h(Icon, { name: 'expand', size: 12 }),
            t('noteInsertImage'),
          ),
          h('span', { className: 'lr-note-editor-hint' }, t('noteEditorHint')),
        ),
        draftOffer
          ? h(
              'div',
              { className: 'lr-note-draft-banner' },
              h(Icon, { name: 'note', size: 13 }),
              h('span', null, `${t('noteEditorDraft')} · ${noteFormatTime(draftOffer.savedAt)}`),
              h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: onRestoreDraft },
                t('noteEditorDraftRestore'),
              ),
              h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: onDiscardDraft },
                t('noteEditorDraftDiscard'),
              ),
            )
          : null,
        error ? h('div', { className: 'lr-note-editor-error' }, error) : null,
        h(
          'div',
          { className: 'lr-note-editor-body' },
          h('textarea', {
            ref: areaRef,
            className: 'lr-note-source',
            value,
            spellCheck: false,
            onChange: (event) => onChange(event.target.value),
            onSelect: (event) => reportCursor(event.currentTarget),
            onClick: (event) => reportCursor(event.currentTarget),
            onKeyUp: (event) => reportCursor(event.currentTarget),
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
                event.preventDefault()
                onSave?.()
                return
              }
              if (event.key === 'Tab') {
                event.preventDefault()
                const area = event.currentTarget
                const start = area.selectionStart
                const end = area.selectionEnd
                const next = `${value.slice(0, start)}  ${value.slice(end)}`
                onChange(next)
                requestAnimationFrame(() => {
                  area.selectionStart = start + 2
                  area.selectionEnd = start + 2
                  reportCursor(area)
                })
              }
            },
          }),
        ),
      )
    }

    // Axis-aligned crop rectangle in normalised 0-1000 page coordinates.
    function noteNormRect(a, b) {
      const x0 = Math.round(Math.min(a.x, b.x) * 1000)
      const y0 = Math.round(Math.min(a.y, b.y) * 1000)
      const x1 = Math.round(Math.max(a.x, b.x) * 1000)
      const y1 = Math.round(Math.max(a.y, b.y) * 1000)
      return [
        Math.max(0, Math.min(1000, x0)),
        Math.max(0, Math.min(1000, y0)),
        Math.max(0, Math.min(1000, x1)),
        Math.max(0, Math.min(1000, y1)),
      ]
    }

    function NoteInsertDialog({ paper, markdown, anchorOffset, onClose, onInserted, showToast }) {
      const [tab, setTab] = useState('upload')
      const [upload, setUpload] = useState(null)
      const [uploadError, setUploadError] = useState('')
      const [instruction, setInstruction] = useState('')
      const [position, setPosition] = useState('auto')
      const [heading, setHeading] = useState('')
      const [page, setPage] = useState(1)
      const [pageLoading, setPageLoading] = useState(true)
      const [drag, setDrag] = useState(null)
      const [region, setRegion] = useState(null)
      const [crop, setCrop] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [question, setQuestion] = useState(null)
      const [answer, setAnswer] = useState('')
      const imgRef = useRef(null)
      const pageCount = Math.max(1, Number(paper?.pageCount) || 1)

      const headings = useMemo(() => {
        const blocks = parseMarkdown(markdown || '').blocks
        const out = []
        for (const block of blocks) {
          if (!block || block.type !== 'heading') continue
          if (Number(block.level) < 2) continue
          const text = (block.inline || []).map((item) => (item && item.text) || '').join('').trim()
          if (text) out.push({ text })
        }
        return out
      }, [markdown])

      useEffect(() => {
        setPageLoading(true)
      }, [page])

      const pickFile = async (file) => {
        if (!file) return
        if (!/^image\/(png|jpeg)$/i.test(file.type)) {
          setUploadError(t('noteInsertTypeBad'))
          return
        }
        if (file.size > 8 * 1024 * 1024) {
          setUploadError(t('noteInsertTooLarge'))
          return
        }
        setUploadError('')
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(new Error(t('noteInsertFailed')))
            reader.readAsDataURL(file)
          })
          setUpload({ dataUrl, name: file.name || '', mediaType: file.type })
        } catch (readError) {
          setUploadError(safeError(readError) || t('noteInsertFailed'))
        }
      }

      const pointFromEvent = (event) => {
        const node = imgRef.current
        if (!node) return null
        const rect = node.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
        return { x, y }
      }

      const finishCrop = async (normalized) => {
        const node = imgRef.current
        if (!node || !normalized) return
        const [x0, y0, x1, y1] = normalized
        if (x1 - x0 < 8 || y1 - y0 < 8) {
          setCrop(null)
          return
        }
        const naturalWidth = node.naturalWidth || 1
        const naturalHeight = node.naturalHeight || 1
        const sx = Math.round((x0 / 1000) * naturalWidth)
        const sy = Math.round((y0 / 1000) * naturalHeight)
        const sw = Math.max(1, Math.round(((x1 - x0) / 1000) * naturalWidth))
        const sh = Math.max(1, Math.round(((y1 - y0) / 1000) * naturalHeight))
        try {
          const canvas = document.createElement('canvas')
          canvas.width = sw
          canvas.height = sh
          const context = canvas.getContext('2d')
          context.drawImage(node, sx, sy, sw, sh, 0, 0, sw, sh)
          const dataUrl = canvas.toDataURL('image/png')
          const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
          const bytes = Math.floor((base64.length * 3) / 4)
          if (bytes > 8 * 1024 * 1024) {
            setError(t('noteInsertTooLarge'))
            setCrop(null)
            return
          }
          setError('')
          setCrop({ dataUrl, mediaType: 'image/png' })
        } catch (cropError) {
          setError(safeError(cropError) || t('noteInsertFailed'))
        }
      }

      const buildAnchor = () => {
        if (position === 'section' && heading) return { heading }
        if (position === 'cursor') {
          const offset = Number(anchorOffset)
          return { afterOffset: Number.isFinite(offset) && offset >= 0 ? offset : 0 }
        }
        return undefined
      }

      const submit = async () => {
        if (busy) return
        const payload = tab === 'upload' ? upload : crop
        if (!payload?.dataUrl) {
          setError(tab === 'upload' ? t('noteInsertPickFile') : t('noteInsertNoRegion'))
          return
        }
        if (position === 'section' && !heading) {
          setError(t('noteInsertPosSection'))
          return
        }
        setBusy(true)
        setError('')
        try {
          const result = await request(`/papers/${paper.id}/summary/images`, {
            method: 'POST',
            body: {
              dataUrl: payload.dataUrl,
              mediaType: payload.mediaType || 'image/png',
              name: tab === 'upload' ? payload.name || '' : '',
              instruction: instruction.trim(),
              anchor: buildAnchor(),
            },
          })
          if (result.status === 'needs_question') {
            setQuestion({ question: result.question || '', suggestion: result.suggestion || '', imageId: result.imageId, round: 1 })
            setAnswer('')
            return
          }
          if (result.markdown !== undefined) {
            onInserted?.(result)
            showToast(t('noteInserted'), 'ok')
            onClose?.()
            return
          }
          setError(t('noteInsertFailed'))
        } catch (submitError) {
          setError(safeError(submitError) || t('noteInsertFailed'))
        } finally {
          setBusy(false)
        }
      }

      const answerQuestion = async (force) => {
        if (busy || !question?.imageId) return
        setBusy(true)
        setError('')
        try {
          const result = await request(`/papers/${paper.id}/summary/images/${encodeURIComponent(question.imageId)}/place`, {
            method: 'POST',
            body: force
              ? { force: true, heading: position === 'section' ? heading : undefined }
              : { answer: answer.trim(), heading: position === 'section' ? heading : undefined },
          })
          if (result.status === 'needs_question' && !force && question.round < 2) {
            setQuestion({
              question: result.question || '',
              suggestion: result.suggestion || '',
              imageId: result.imageId || question.imageId,
              round: question.round + 1,
            })
            setAnswer('')
            return
          }
          if (result.markdown !== undefined) {
            onInserted?.(result)
            showToast(t('noteInserted'), 'ok')
            onClose?.()
            return
          }
          setError(t('noteInsertFailed'))
        } catch (answerError) {
          setError(safeError(answerError) || t('noteQuestionFailed'))
        } finally {
          setBusy(false)
        }
      }

      if (question) {
        return h(
          Modal,
          { title: t('noteQuestionTitle'), subtitle: paper?.title, onClose: busy ? () => {} : onClose },
          h(
            'div',
            { className: 'lr-note-question' },
            h('div', { className: 'lr-note-question-badge' }, t('noteQuestionRound').split('{round}').join(String(question.round))),
            h('div', { className: 'lr-note-question-text' }, question.question),
            question.suggestion ? h('div', { className: 'lr-note-question-suggest' }, question.suggestion) : null,
            h('textarea', {
              className: 'lr-ann-input',
              rows: 3,
              value: answer,
              placeholder: t('noteQuestionAnswerPlaceholder'),
              onChange: (event) => setAnswer(event.target.value),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  answerQuestion(false)
                }
              },
            }),
            error ? h('div', { className: 'lr-ann-error' }, error) : null,
            h(
              'div',
              { className: 'lr-ann-dialog-actions' },
              h('span', { className: 'lr-ann-spacer' }),
              h('button', { type: 'button', className: 'lr-btn', onClick: onClose, disabled: busy }, t('cancel')),
              h(
                'button',
                { type: 'button', className: 'lr-btn', onClick: () => answerQuestion(true), disabled: busy },
                t('noteQuestionForce'),
              ),
              h(
                'button',
                { type: 'button', className: 'lr-btn primary', onClick: () => answerQuestion(false), disabled: busy },
                busy ? h(Spinner, { size: 12 }) : h(Icon, { name: 'arrowUp', size: 13 }),
                t('noteQuestionSubmit'),
              ),
            ),
          ),
        )
      }

      return h(
        Modal,
        { title: t('noteInsertTitle'), subtitle: paper?.title, onClose: busy ? () => {} : onClose, wide: true },
        h(
          'div',
          { className: 'lr-note-insert' },
          h(
            'div',
            { className: 'lr-note-tabs' },
            h(
              'button',
              {
                type: 'button',
                className: `lr-note-tab${tab === 'upload' ? ' active' : ''}`,
                onClick: () => setTab('upload'),
              },
              h(Icon, { name: 'upload', size: 13 }),
              t('noteInsertUpload'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: `lr-note-tab${tab === 'crop' ? ' active' : ''}`,
                onClick: () => setTab('crop'),
              },
              h(Icon, { name: 'select', size: 13 }),
              t('noteInsertCrop'),
            ),
          ),
          tab === 'upload'
            ? h(
                'div',
                { className: 'lr-note-upload' },
                h(
                  'label',
                  { className: 'lr-note-upload-pick' },
                  h(Icon, { name: 'upload', size: 15 }),
                  t('noteInsertPickFile'),
                  h('input', {
                    type: 'file',
                    accept: 'image/png,image/jpeg',
                    className: 'lr-file-input',
                    onChange: (event) => pickFile(event.target.files && event.target.files[0]),
                  }),
                ),
                upload
                  ? h('img', { className: 'lr-note-upload-preview', src: upload.dataUrl, alt: t('noteInsertPreview') })
                  : null,
                uploadError ? h('div', { className: 'lr-ann-error' }, uploadError) : null,
              )
            : h(
                'div',
                { className: 'lr-note-crop' },
                h(
                  'div',
                  { className: 'lr-note-crop-bar' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn icon small',
                      onClick: () => setPage((value) => Math.max(1, value - 1)),
                      disabled: page <= 1,
                      title: t('noteInsertPrevPage'),
                    },
                    h(Icon, { name: 'chevronLeft', size: 12 }),
                  ),
                  h('span', { className: 'lr-note-crop-page' }, t('noteInsertPage').split('{page}').join(String(page)).split('{total}').join(String(pageCount))),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn icon small',
                      onClick: () => setPage((value) => Math.min(pageCount, value + 1)),
                      disabled: page >= pageCount,
                      title: t('noteInsertNextPage'),
                    },
                    h(Icon, { name: 'chevronRight', size: 12 }),
                  ),
                  h('span', { className: 'lr-note-crop-hint' }, t('noteInsertDragHint')),
                ),
                h(
                  'div',
                  { className: 'lr-note-crop-stage' },
                  h('img', {
                    ref: imgRef,
                    src: `${API}/papers/${paper.id}/page/${page}`,
                    alt: t('noteInsertPage').split('{page}').join(String(page)).split('{total}').join(String(pageCount)),
                    draggable: false,
                    onLoad: () => setPageLoading(false),
                    onError: () => setPageLoading(false),
                    onPointerDown: (event) => {
                      const point = pointFromEvent(event)
                      if (!point) return
                      event.currentTarget.setPointerCapture?.(event.pointerId)
                      setDrag({ start: point, current: point })
                    },
                    onPointerMove: (event) => {
                      if (!drag) return
                      const point = pointFromEvent(event)
                      if (point) setDrag({ start: drag.start, current: point })
                    },
                    onPointerUp: () => {
                      if (!drag) return
                      const normalized = noteNormRect(drag.start, drag.current)
                      setDrag(null)
                      setRegion(normalized)
                      finishCrop(normalized)
                    },
                    onPointerCancel: () => setDrag(null),
                  }),
                  drag
                    ? h('div', {
                        className: 'lr-note-crop-box',
                        style: {
                          left: `${Math.min(drag.start.x, drag.current.x) * 100}%`,
                          top: `${Math.min(drag.start.y, drag.current.y) * 100}%`,
                          width: `${Math.abs(drag.current.x - drag.start.x) * 100}%`,
                          height: `${Math.abs(drag.current.y - drag.start.y) * 100}%`,
                        },
                      })
                    : region
                      ? h('div', {
                          className: 'lr-note-crop-box locked',
                          style: {
                            left: `${(region[0] / 1000) * 100}%`,
                            top: `${(region[1] / 1000) * 100}%`,
                            width: `${((region[2] - region[0]) / 1000) * 100}%`,
                            height: `${((region[3] - region[1]) / 1000) * 100}%`,
                          },
                        })
                      : null,
                  pageLoading ? h('div', { className: 'lr-note-crop-loading' }, h(Spinner, { size: 16 }), t('noteInsertLoadingPage')) : null,
                ),
                crop
                  ? h(
                      'div',
                      { className: 'lr-note-crop-result' },
                      h('img', { src: crop.dataUrl, alt: t('noteInsertPreview') }),
                      h('span', null, t('noteInsertPreview')),
                    )
                  : null,
              ),
          h('input', {
            className: 'lr-note-insert-input',
            value: instruction,
            placeholder: t('noteInsertInstruction'),
            onChange: (event) => setInstruction(event.target.value),
          }),
          h(
            'div',
            { className: 'lr-ann-dialog-row' },
            h('span', { className: 'lr-ann-label' }, t('noteInsertPosition')),
            h(
              'div',
              { className: 'lr-note-pos' },
              [
                ['auto', t('noteInsertPosAuto')],
                ['section', t('noteInsertPosSection')],
                ['cursor', t('noteInsertPosCursor')],
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    key: value,
                    type: 'button',
                    className: `lr-note-pos-btn${position === value ? ' active' : ''}`,
                    onClick: () => setPosition(value),
                  },
                  label,
                ),
              ),
            ),
          ),
          position === 'section'
            ? h(
                'select',
                {
                  className: 'lr-select lr-note-section-select',
                  value: heading,
                  onChange: (event) => setHeading(event.target.value),
                },
                h('option', { value: '' }, t('noteInsertPosSection')),
                headings.map((item) =>
                  h('option', { key: item.text, value: item.text }, item.text),
                ),
              )
            : null,
          position === 'cursor'
            ? h('div', { className: 'lr-note-cursor-hint' }, t('noteInsertCursorHint'))
            : null,
          error ? h('div', { className: 'lr-ann-error' }, error) : null,
          h(
            'div',
            { className: 'lr-ann-dialog-actions' },
            h('span', { className: 'lr-ann-spacer' }),
            h('button', { type: 'button', className: 'lr-btn', onClick: onClose, disabled: busy }, t('cancel')),
            h(
              'button',
              { type: 'button', className: 'lr-btn primary', onClick: submit, disabled: busy },
              busy ? h(Spinner, { size: 12 }) : h(Icon, { name: 'check', size: 13 }),
              busy ? t('noteInserting') : t('noteInsertSubmit'),
            ),
          ),
        ),
      )
    }

    // Version list for a note file. Shared by the summary editor and the reader
    // note panel: only the reason vocabulary and the empty text differ, so both
    // pass their own `labelOf`/`emptyText` instead of duplicating the shell.
    function NoteHistoryDrawer({ open, loading, versions, error, onClose, onPreview, onRestore, busy, labelOf, emptyText }) {
      if (!open) return null
      const reasonOf =
        typeof labelOf === 'function'
          ? labelOf
          : (item) =>
              item.source === 'manual'
                ? t('noteHistorySourceManual')
                : item.source === 'revision'
                  ? t('noteHistorySourceRevision')
                  : item.source === 'restore'
                    ? t('noteHistorySourceRestore')
                    : item.source === 'summary' || item.source === 'auto'
                      ? t('noteHistorySourceAuto')
                      : t('noteHistorySourceUnknown')
      return h(
        'div',
        { className: 'lr-note-history-mask', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose?.() } },
        h(
          'aside',
          { className: 'lr-note-history', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('noteHistoryTitle') },
          h(
            'div',
            { className: 'lr-note-history-head' },
            h(Icon, { name: 'refresh', size: 14 }),
            h('span', { className: 'lr-note-history-title' }, t('noteHistoryTitle')),
            h(
              'button',
              { type: 'button', className: 'lr-btn icon small', onClick: onClose, 'aria-label': t('close') },
              h(Icon, { name: 'close', size: 12 }),
            ),
          ),
          h(
            'div',
            { className: 'lr-note-history-body' },
            loading
              ? h('div', { className: 'lr-note-history-empty' }, h(Spinner, { size: 14 }), t('noteHistoryLoading'))
              : error
                ? h('div', { className: 'lr-note-history-empty' }, error)
                : versions.length === 0
                  ? h('div', { className: 'lr-note-history-empty' }, emptyText || t('noteHistoryEmpty'))
                  : versions.map((item) => {
                      const stamp = item.stamp || item.id || ''
                      const label = reasonOf(item)
                      return h(
                        'div',
                        { key: stamp, className: 'lr-note-history-row' },
                        h(
                          'div',
                          { className: 'lr-note-history-main' },
                          h('div', { className: 'lr-note-history-time' }, noteFormatTime(item.updatedAt || item.createdAt || '')),
                          h(
                            'div',
                            { className: 'lr-note-history-meta' },
                            h('span', { className: 'lr-note-history-tag' }, label),
                            h(
                              'span',
                              null,
                              t('noteHistoryChars').split('{count}').join(String(item.chars || 0)),
                            ),
                          ),
                        ),
                        h(
                          'div',
                          { className: 'lr-note-history-actions' },
                          h(
                            'button',
                            { type: 'button', className: 'lr-btn small', onClick: () => onPreview?.(item), disabled: busy },
                            t('noteHistoryPreview'),
                          ),
                          h(
                            'button',
                            { type: 'button', className: 'lr-btn small', onClick: () => onRestore?.(item), disabled: busy },
                            t('noteHistoryRestore'),
                          ),
                        ),
                      )
                    }),
          ),
        ),
      )
    }

    // Full-screen summary. It owns the summary text, its annotations, the
    // Markdown editor, image insertion, figure completion and history.
    function NoteView({ paper, onBack, onCitePage, onOpenObsidian, onRegenerate, showToast, onPaperChanged }) {
      const paperId = paper?.id || ''
      const [mode, setMode] = useState('preview')
      const [loading, setLoading] = useState(true)
      const [loadError, setLoadError] = useState('')
      const [markdown, setMarkdown] = useState('')
      const [version, setVersion] = useState('')
      const [updatedAt, setUpdatedAt] = useState('')
      const [annotations, setAnnotations] = useState(EMPTY)
      const [annError, setAnnError] = useState('')
      const [panelOpen, setPanelOpen] = useState(() => {
        try {
          return window.innerWidth > 1100
        } catch {
          return true
        }
      })
      const [dialog, setDialog] = useState(null)
      const [toolbar, setToolbar] = useState(null)
      const [instruction, setInstruction] = useState('')
      const [applying, setApplying] = useState(null)
      const [draft, setDraft] = useState('')
      const [dirty, setDirty] = useState(false)
      const [saveState, setSaveState] = useState('saved')
      const [saveError, setSaveError] = useState('')
      const [conflict, setConflict] = useState(false)
      const [draftOffer, setDraftOffer] = useState(null)
      const [insertOpen, setInsertOpen] = useState(false)
      const [anchorOffset, setAnchorOffset] = useState(null)
      const [historyOpen, setHistoryOpen] = useState(false)
      const [historyLoading, setHistoryLoading] = useState(false)
      const [historyVersions, setHistoryVersions] = useState(EMPTY)
      const [historyError, setHistoryError] = useState('')
      const [historyPreview, setHistoryPreview] = useState(null)
      const [lightbox, setLightbox] = useState(null)
      const [figures, setFigures] = useState(null)
      const [moreOpen, setMoreOpen] = useState(false)
      // Obsidian is read-only for us, so a vault note newer than the local body
      // means someone hand-edited it there. We warn, but never block saving.
      const [vaultState, setVaultState] = useState(null)
      const [vaultPreview, setVaultPreview] = useState(null)

      const paperWrapRef = useRef(null)
      const scrollRef = useRef(null)
      const pendingRef = useRef(null)
      const applyAbort = useRef(null)
      const figuresAbort = useRef(null)
      const modeRef = useRef('preview')
      const moreRef = useRef(null)

      useEffect(() => {
        modeRef.current = mode
      }, [mode])

      const parsed = useMemo(() => {
        const result = parseMarkdown(markdown)
        const projection = plainProjection(result.blocks)
        return { blocks: result.blocks, projection }
      }, [markdown])

      // Fetch the Obsidian body once, ahead of the click. If the user only ever
      // gets a passive link they tend to save first and only then read the
      // warning — by then the hand edit is gone, so pull it while it still exists.
      const prefetchVaultBody = useCallback(async () => {
        if (!paperId) return null
        try {
          const result = await request(`/papers/${paperId}/summary/vault-body`)
          const body = {
            markdown: result.markdown || '',
            updatedAt: result.updatedAt || '',
            missing: false,
            error: '',
          }
          setVaultPreview(body)
          return body
        } catch (error) {
          const missing = Boolean(error && error.status === 404)
          const body = {
            markdown: '',
            updatedAt: '',
            missing,
            error: missing ? t('noteVaultMissing') : safeError(error) || t('noteVaultLoadFailed'),
          }
          setVaultPreview(body)
          return body
        }
      }, [paperId])

      // Open the read-only dialog instantly when the body is already cached.
      function openVaultPreview() {
        if (vaultPreview && vaultPreview.markdown) {
          setVaultPreview({ ...vaultPreview, open: true })
          return
        }
        setVaultPreview({ markdown: '', updatedAt: '', missing: false, error: '', loading: true, open: true })
        prefetchVaultBody().then((body) => {
          if (body) setVaultPreview({ ...body, open: true })
        })
      }

      const load = useCallback(
        async (silent) => {
          if (!paperId) return null
          if (!silent) {
            setLoading(true)
            setLoadError('')
          }
          try {
            const result = await request(`/papers/${paperId}/summary`)
            setMarkdown(result.markdown || '')
            setVersion(result.version || '')
            setUpdatedAt(result.updatedAt || '')
            setAnnotations(Array.isArray(result.annotations) ? result.annotations : EMPTY)
            setLoading(false)
            setLoadError('')
            // Vault drift is a hint, not a gate: remember it and keep going.
            // Keep an existing dismissal so a silent reload (after apply, undo,
            // restore) does not pop the banner back at the user.
            const modified = Boolean(result.vaultModified)
            setVaultState((current) => ({
              modified,
              time: noteFormatTime(result.vaultUpdatedAt || ''),
              dismissed: Boolean(current && current.dismissed),
            }))
            if (modified) prefetchVaultBody()
            return result
          } catch (error) {
            if (!silent) {
              setLoadError(safeError(error) || t('noteLoadFailed'))
              setLoading(false)
            }
            return null
          }
        },
        [paperId, prefetchVaultBody],
      )

      useEffect(() => {
        load(false)
      }, [load])

      // Autosave a local draft so an accidental refresh never loses work.
      useEffect(() => {
        if (mode !== 'edit' || !dirty || !paperId) return
        const timer = setTimeout(() => {
          writeNoteDraft(paperId, {
            markdown: draft,
            baseVersion: version,
            savedAt: new Date().toISOString(),
          })
        }, 600)
        return () => clearTimeout(timer)
      }, [draft, dirty, mode, paperId, version])

      // Close the "more" menu on an outside click.
      useEffect(() => {
        if (!moreOpen) return
        const onDown = (event) => {
          if (moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [moreOpen])

      // The browser-level guard mirrors the in-app confirm: leaving the page
      // with unsaved source would lose the edit even though a draft exists.
      useEffect(() => {
        if (mode !== 'edit' || !dirty) return
        const onBeforeUnload = (event) => {
          event.preventDefault()
          event.returnValue = t('noteLeaveBody')
          return event.returnValue
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
      }, [dirty, mode])

      // Selection -> floating toolbar. Only in preview mode and only for
      // selections that start and end inside the document.
      useEffect(() => {
        if (mode !== 'preview') {
          setToolbar(null)
          pendingRef.current = null
          return
        }
        const root = paperWrapRef.current
        if (!root) return
        let timer = 0
        const measure = () => {
          const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setToolbar(null)
            return
          }
          const range = selection.getRangeAt(0)
          if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
            setToolbar(null)
            return
          }
          const span = noteSelectionSpan(root, range)
          if (!span) {
            setToolbar(null)
            return
          }
          const text = parsed.projection.text.slice(span.from, span.to)
          if (!/\S/.test(text)) {
            setToolbar(null)
            return
          }
          const rect = range.getBoundingClientRect()
          const box = root.getBoundingClientRect()
          pendingRef.current = { from: span.from, to: span.to, quote: text, start: range.startOffset }
          setToolbar({
            left: Math.max(64, Math.min(Math.max(64, box.width - 64), rect.left - box.left + rect.width / 2)),
            top: Math.max(4, rect.top - box.top - 40),
          })
        }
        const onUp = () => {
          clearTimeout(timer)
          timer = setTimeout(measure, 30)
        }
        const onSelectionChange = () => {
          clearTimeout(timer)
          timer = setTimeout(measure, 140)
        }
        document.addEventListener('mouseup', onUp)
        document.addEventListener('selectionchange', onSelectionChange)
        return () => {
          clearTimeout(timer)
          document.removeEventListener('mouseup', onUp)
          document.removeEventListener('selectionchange', onSelectionChange)
        }
      }, [mode, parsed])

      const openAnnotations = useMemo(
        () => (annotations || []).filter((item) => item && item.status !== 'resolved' && item.status !== 'orphan'),
        [annotations],
      )
      const orphanCount = useMemo(
        () => (annotations || []).filter((item) => item && item.status === 'orphan').length,
        [annotations],
      )

      function scrollToAnnotation(id) {
        if (!id) return
        const root = paperWrapRef.current
        const node = root ? root.querySelector(`[data-ann="${String(id).replace(/"/g, '\\"')}"]`) : null
        if (node) {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return
        }
        scrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      }

      function requestBack() {
        if (mode === 'edit' && dirty && !window.confirm(t('noteLeaveBody'))) return
        onBack?.()
      }

      function enterEdit() {
        setDraft(markdown)
        setDirty(false)
        setSaveState('saved')
        setSaveError('')
        setConflict(false)
        setAnchorOffset(null)
        const stored = paperId ? readNoteDraft(paperId) : null
        setDraftOffer(stored && stored.markdown !== markdown ? stored : null)
        setToolbar(null)
        setMode('edit')
      }

      function leaveEdit() {
        if (dirty && !window.confirm(t('noteLeaveEditBody'))) return
        setMode('preview')
        setDraftOffer(null)
        setConflict(false)
        setSaveError('')
      }

      function onChangeSource(next) {
        setDraft(next)
        setDirty(next !== markdown)
        setSaveState(next === markdown ? 'saved' : 'unsaved')
      }

      async function saveSource(force) {
        if (!paperId) return
        setSaveState('saving')
        setSaveError('')
        try {
          const result = await request(`/papers/${paperId}/summary`, {
            method: 'PUT',
            body: { markdown: draft, baseVersion: version, force: Boolean(force) },
          })
          const nextText = typeof result.markdown === 'string' ? result.markdown : draft
          setMarkdown(nextText)
          setVersion(result.version || version)
          setUpdatedAt(result.updatedAt || new Date().toISOString())
          if (Array.isArray(result.annotations)) setAnnotations(result.annotations)
          setDraft(nextText)
          setDirty(false)
          setSaveState('saved')
          setConflict(false)
          if (paperId) clearNoteDraft(paperId)
          // The host warns when this save replaced a newer hand edit in
          // Obsidian. Local history cannot restore it, so say so precisely.
          if (result.vaultOverwritten) {
            setVaultState((current) => (current ? { ...current, modified: false, dismissed: true } : current))
            setVaultPreview(null)
            showToast?.(t('noteVaultOverwritten'), 'warn')
          } else if (Array.isArray(result.lost) && result.lost.length > 0) {
            showToast?.(t('noteAnnLost').split('{count}').join(String(result.lost.length)), 'warn')
          } else {
            showToast?.(t('noteSaved'), 'ok')
          }
          onPaperChanged?.({ updatedAt: result.updatedAt || '' })
        } catch (error) {
          setSaveState('error')
          setSaveError(safeError(error) || t('noteSaveFailed'))
          if (error && error.status === 409) setConflict(true)
        }
      }

      async function reloadFromServer() {
        setConflict(false)
        setDraftOffer(null)
        const result = await load(true)
        if (result) {
          setDraft(result.markdown || '')
          setDirty(false)
          setSaveState('saved')
          setSaveError('')
          if (paperId) clearNoteDraft(paperId)
          showToast?.(t('noteReloaded'), 'ok')
        }
      }

      async function persistAnnotations(next) {
        setAnnotations(next)
        if (!paperId) return
        try {
          const result = await request(`/papers/${paperId}/summary/annotations`, {
            method: 'PUT',
            body: { annotations: next },
          })
          if (Array.isArray(result.annotations)) setAnnotations(result.annotations)
          setAnnError('')
        } catch (error) {
          setAnnError(safeError(error) || t('noteAnnSaveFailed'))
          throw error
        }
      }

      function makeAnnotation(draftInput) {
        const projection = parsed.projection
        const existing = draftInput.id ? (annotations || []).find((item) => item.id === draftInput.id) : null
        if (existing) {
          return {
            ...existing,
            note: draftInput.note,
            color: draftInput.color,
          }
        }
        const mapped = mapPlainToSource(projection, draftInput.from, draftInput.to)
        if (!mapped) return null
        const text = projection.text
        return {
          id: noteMakeId(),
          quote: text.slice(draftInput.from, draftInput.to),
          prefix: text.slice(Math.max(0, draftInput.from - 48), draftInput.from),
          suffix: text.slice(draftInput.to, Math.min(text.length, draftInput.to + 48)),
          start: mapped.start,
          end: mapped.end,
          note: draftInput.note,
          color: draftInput.color,
          status: 'open',
          createdAt: new Date().toISOString(),
          resolvedAt: '',
          revision: 0,
          reply: '',
        }
      }

      async function saveAnnotation(draftInput) {
        const annotation = makeAnnotation(draftInput)
        if (!annotation) {
          throw new Error(t('noteAnnFailedLocate'))
        }
        const exists = (annotations || []).some((item) => item.id === annotation.id)
        const next = exists
          ? (annotations || []).map((item) => (item.id === annotation.id ? annotation : item))
          : [...(annotations || []), annotation]
        await persistAnnotations(next)
        setDialog(null)
        const root = paperWrapRef.current
        if (root) {
          const range = typeof document.createRange === 'function' ? document.createRange() : null
          if (range) range.selectNodeContents(root)
          const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
          selection?.removeAllRanges?.()
        }
        setToolbar(null)
        pendingRef.current = null
        showToast?.(t('noteAnnSaved'), 'ok')
      }

      async function deleteAnnotation(id) {
        const next = (annotations || []).filter((item) => item.id !== id)
        await persistAnnotations(next)
        setDialog(null)
        showToast?.(t('noteAnnDeleted'), 'ok')
      }

      async function editAnnotation(id) {
        const found = (annotations || []).find((item) => item.id === id)
        if (!found) return
        setDialog({
          id: found.id,
          quote: found.quote || '',
          note: found.note || '',
          color: found.color || 'amber',
          reply: found.reply || '',
        })
      }

      function onPickAnnotation(id) {
        if (modeRef.current !== 'preview') return
        editAnnotation(id)
      }

      async function applyAnnotations() {
        if (!paperId || applying) return
        const ids = openAnnotations.map((item) => item.id)
        const extra = instruction.trim()
        if (ids.length === 0 && !extra) return
        setApplying({ label: t('noteApplying') })
        setToolbar(null)
        const controller = new AbortController()
        applyAbort.current = controller
        let finished = null
        let failure = ''
        try {
          await streamSse(
            `/papers/${paperId}/summary/revise`,
            { ids, instruction: extra },
            (event) => {
              if (!event) return
              if (event.type === 'status') {
                setApplying({ label: event.label || t('noteApplying') })
              } else if (event.type === 'figure') {
                setApplying({
                  label: t('noteApplyingFigure')
                    .split('{index}')
                    .join(String((event.index || 0) + 1))
                    .split('{total}')
                    .join(String(event.total || 1)),
                })
              } else if (event.type === 'done') {
                finished = event
              }
            },
            controller.signal,
          )
        } catch (error) {
          if (error && error.name !== 'AbortError') failure = safeError(error) || t('noteApplyFailed')
        } finally {
          applyAbort.current = null
        }
        if (failure) {
          setApplying(null)
          showToast?.(failure, 'error')
          return
        }
        if (!finished) {
          setApplying(null)
          showToast?.(t('noteApplyFailed'), 'error')
          return
        }
        const applied = Array.isArray(finished.applied) ? finished.applied.length : 0
        const unresolved = Array.isArray(finished.unresolved) ? finished.unresolved.length : 0
        setMarkdown(typeof finished.markdown === 'string' ? finished.markdown : markdown)
        if (finished.version) setVersion(finished.version)
        setInstruction('')
        await load(true)
        setApplying(null)
        // Same warning as an editor save: the revision replaced a newer hand
        // edit in Obsidian, and local history does not contain that text.
        const overwrote = Boolean(finished.vaultOverwritten)
        if (overwrote) {
          setVaultState((current) => (current ? { ...current, modified: false, dismissed: true } : current))
          setVaultPreview(null)
        }
        const message = unresolved > 0
          ? t('noteApplyUnresolved').split('{applied}').join(String(applied)).split('{unresolved}').join(String(unresolved))
          : t('noteApplyDone').split('{count}').join(String(applied))
        if (overwrote) {
          showToast?.(`${message} · ${t('noteVaultOverwritten')}`, 'warn')
        } else {
          showToast?.(message, unresolved > 0 ? 'warn' : 'ok')
        }
        const first = Array.isArray(finished.applied) && finished.applied.length > 0 ? finished.applied[0] : null
        const firstId = first && typeof first === 'object' ? first.id : first
        setTimeout(() => {
          if (firstId) scrollToAnnotation(firstId)
          else scrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
        }, 80)
      }

      async function runFigures() {
        if (!paperId || figures) return
        const placeholders = findFigurePlaceholders(markdown)
        if (placeholders.length === 0) {
          showToast?.(t('noteNoPlaceholders'), 'warn')
          return
        }
        setFigures({ running: true, total: placeholders.length, done: 0, label: t('noteFiguresRunning') })
        const controller = new AbortController()
        figuresAbort.current = controller
        let created = 0
        let failed = 0
        let finished = null
        try {
          await streamSse(
            `/papers/${paperId}/summary/figures`,
            { placeholders },
            (event) => {
              if (!event) return
              if (event.type === 'start') {
                setFigures({
                  running: true,
                  total: Number(event.total) || placeholders.length,
                  done: 0,
                  label: t('noteFiguresRunning'),
                })
              } else if (event.type === 'status') {
                setFigures((current) => (current ? { ...current, label: event.label || current.label } : current))
              } else if (event.type === 'figure') {
                if (event.ok) created += 1
                else failed += 1
                setFigures((current) =>
                  current ? { ...current, done: (current.done || 0) + 1 } : current,
                )
              } else if (event.type === 'done') {
                finished = event
              }
            },
            controller.signal,
          )
        } catch (error) {
          if (!error || error.name !== 'AbortError') {
            showToast?.(safeError(error) || t('noteFiguresFailed'), 'error')
          }
        } finally {
          figuresAbort.current = null
          setFigures(null)
        }
        if (finished) {
          setMarkdown(typeof finished.markdown === 'string' ? finished.markdown : markdown)
          if (finished.version) setVersion(finished.version)
          await load(true)
          showToast?.(
            t('noteFiguresDone')
              .split('{created}')
              .join(String(Number(finished.created) || created))
              .split('{failed}')
              .join(String(Number(finished.failed) || failed)),
            failed > 0 || Number(finished.failed) > 0 ? 'warn' : 'ok',
          )
        }
      }

      async function openHistory() {
        setHistoryOpen(true)
        setMoreOpen(false)
        setHistoryLoading(true)
        setHistoryError('')
        try {
          const result = await request(`/papers/${paperId}/summary/history`)
          setHistoryVersions(Array.isArray(result.versions) ? result.versions : EMPTY)
        } catch (error) {
          setHistoryError(safeError(error) || t('noteHistoryFailed'))
        } finally {
          setHistoryLoading(false)
        }
      }

      async function previewHistory(item) {
        setHistoryPreview({
          loading: true,
          item,
          title: noteFormatTime(item.updatedAt || item.createdAt || ''),
          markdown: '',
        })
        try {
          const result = await request(
            `/papers/${paperId}/summary/history/${encodeURIComponent(item.stamp || item.id || '')}`,
          )
          setHistoryPreview({
            loading: false,
            item,
            title: noteFormatTime(item.updatedAt || item.createdAt || ''),
            markdown: result.markdown || '',
          })
        } catch (error) {
          setHistoryPreview(null)
          showToast?.(safeError(error) || t('noteHistoryFailed'), 'error')
        }
      }

      async function restoreHistory(item) {
        if (!item || !paperId) return
        if (!window.confirm(t('noteHistoryRestoreConfirm'))) return
        try {
          const result = await request(
            `/papers/${paperId}/summary/history/${encodeURIComponent(item.stamp || item.id || '')}/restore`,
            { method: 'POST' },
          )
          setHistoryOpen(false)
          if (result && typeof result.markdown === 'string') setMarkdown(result.markdown)
          if (result && result.version) setVersion(result.version)
          await load(true)
          setDirty(false)
          if (paperId) clearNoteDraft(paperId)
          showToast?.(t('noteRestoreDone'), 'ok')
          onPaperChanged?.({ updatedAt: (result && result.updatedAt) || '' })
        } catch (error) {
          showToast?.(safeError(error) || t('noteRestoreFailed'), 'error')
        }
      }

      function onInserted(result) {
        if (result && typeof result.markdown === 'string') {
          setMarkdown(result.markdown)
          setDirty(false)
          if (modeRef.current === 'edit') setDraft(result.markdown)
        }
        if (result && result.version) setVersion(result.version)
        if (result && result.updatedAt) setUpdatedAt(result.updatedAt)
        load(true)
        onPaperChanged?.({ updatedAt: (result && result.updatedAt) || '' })
      }

      function openInsert() {
        setAnchorOffset(null)
        setInsertOpen(true)
      }

      if (loading) {
        return h(
          'div',
          { className: 'lr-note' },
          h('div', { className: 'lr-note-loading' }, h(Spinner, { size: 20 }), t('noteLoading')),
        )
      }

      if (loadError) {
        return h(
          'div',
          { className: 'lr-note' },
          h(
            'div',
            { className: 'lr-note-empty' },
            h('div', { className: 'lr-note-empty-icon' }, h(Icon, { name: 'note', size: 30 })),
            h('div', { className: 'lr-note-empty-title' }, t('noteLoadFailed')),
            h('div', { className: 'lr-note-empty-desc' }, loadError),
            h(
              'div',
              { className: 'lr-note-empty-actions' },
              h(
                'button',
                { type: 'button', className: 'lr-btn', onClick: requestBack },
                h(Icon, { name: 'chevronLeft', size: 13 }),
                t('noteBack'),
              ),
              h('button', { type: 'button', className: 'lr-btn', onClick: () => load(false) }, t('retry')),
              onRegenerate
                ? h(
                    'button',
                    { type: 'button', className: 'lr-btn primary', onClick: onRegenerate },
                    h(Icon, { name: 'sparkle', size: 13 }),
                    t('noteGenerate'),
                  )
                : null,
            ),
          ),
        )
      }

      const saveLabel =
        saveState === 'saving'
          ? t('noteSaving')
          : saveState === 'unsaved'
            ? t('noteUnsaved')
            : saveState === 'error'
              ? t('noteSaveFailedShort')
              : t('noteSaved')

      const annotationForDialog = dialog || null

      return h(
        'div',
        { className: 'lr-note' },
        h(
          'header',
          { className: 'lr-note-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'lr-btn small lr-note-back',
              onClick: requestBack,
              title: t('noteBack'),
            },
            h(Icon, { name: 'chevronLeft', size: 13 }),
            h('span', { className: 'lr-note-btn-label' }, t('noteBack')),
          ),
          h(
            'div',
            { className: 'lr-note-head-title' },
            h('div', { className: 'lr-note-head-name', title: paper?.title || '' }, paper?.title || ''),
            h(
              'div',
              { className: 'lr-note-head-meta' },
              // Positioning line: this is a quick-recall summary, not a notebook.
              h('span', { className: 'lr-note-head-kind' }, t('noteKind')),
              ' · ',
              t('noteWordCount').split('{count}').join(String(noteWordCount(markdown))),
              updatedAt ? ` · ${noteFormatTime(updatedAt)}` : '',
            ),
          ),
          h(
            'div',
            { className: 'lr-note-tabs', role: 'tablist' },
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: `lr-note-tab${mode === 'preview' ? ' active' : ''}`,
                'aria-selected': mode === 'preview',
                onClick: () => {
                  if (mode === 'edit') leaveEdit()
                },
              },
              h(Icon, { name: 'book', size: 12 }),
              t('notePreviewTab'),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: `lr-note-tab${mode === 'edit' ? ' active' : ''}`,
                'aria-selected': mode === 'edit',
                onClick: () => {
                  if (mode === 'preview') enterEdit()
                },
              },
              h(Icon, { name: 'pen', size: 12 }),
              t('noteEditorTab'),
            ),
          ),
          h('span', { className: `lr-note-save-state ${saveState}` }, saveLabel),
          h(
            'div',
            { className: 'lr-note-head-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn small',
                onClick: openInsert,
                disabled: Boolean(applying) || Boolean(figures),
                title: t('noteInsertImage'),
              },
              h(Icon, { name: 'expand', size: 13 }),
              h('span', { className: 'lr-note-btn-label' }, t('noteInsertImage')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn small',
                onClick: runFigures,
                disabled: Boolean(applying) || Boolean(figures),
                title: t('noteFixFigures'),
              },
              figures ? h(Spinner, { size: 12 }) : h(Icon, { name: 'sparkle', size: 13 }),
              h(
                'span',
                { className: 'lr-note-btn-label' },
                figures
                  ? t('noteFiguresProgress')
                      .split('{index}')
                      .join(String(Math.min(figures.done + 1, figures.total)))
                      .split('{total}')
                      .join(String(figures.total))
                  : t('noteFixFigures'),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn small',
                onClick: openHistory,
                disabled: Boolean(applying),
                title: t('noteHistory'),
              },
              h(Icon, { name: 'refresh', size: 13 }),
              h('span', { className: 'lr-note-btn-label' }, t('noteHistory')),
            ),
            h(
              'div',
              { className: 'lr-note-more', ref: moreRef },
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-btn icon small',
                  onClick: () => setMoreOpen((value) => !value),
                  title: t('noteMore'),
                  'aria-expanded': moreOpen,
                },
                h(Icon, { name: 'list', size: 13 }),
              ),
              moreOpen
                ? h(
                    'div',
                    { className: 'lr-note-more-menu' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-note-more-item',
                        onClick: () => {
                          setMoreOpen(false)
                          onRegenerate?.()
                        },
                      },
                      h(Icon, { name: 'sparkle', size: 12 }),
                      t('regenerateSummary'),
                    ),
                    onOpenObsidian
                      ? h(
                          'button',
                          {
                            type: 'button',
                            className: 'lr-note-more-item',
                            onClick: () => {
                              setMoreOpen(false)
                              onOpenObsidian()
                            },
                          },
                          h(Icon, { name: 'note', size: 12 }),
                          t('openObsidian'),
                        )
                      : null,
                  )
                : null,
            ),
            h(
              'button',
              {
                type: 'button',
                className: `lr-btn icon small lr-note-panel-toggle${panelOpen ? ' active' : ''}`,
                onClick: () => setPanelOpen((value) => !value),
                title: t('noteAnnPanelToggle'),
                'aria-expanded': panelOpen,
              },
              h(Icon, { name: 'quote', size: 13 }),
              annotations.length > 0
                ? h('span', { className: 'lr-note-panel-count' }, String(annotations.length))
                : null,
            ),
          ),
        ),
        annError
          ? h(
              'div',
              { className: 'lr-note-banner warn' },
              h(Icon, { name: 'close', size: 13 }),
              h('span', null, annError),
              h(
                'button',
                { type: 'button', className: 'lr-note-banner-close', onClick: () => setAnnError('') },
                h(Icon, { name: 'close', size: 11 }),
              ),
            )
          : null,
        // Purely advisory: Obsidian has text we are about to replace. Nothing
        // here disables editing or saving — the plugin stays the writing surface.
        vaultState?.modified && !vaultState.dismissed
          ? h(
              'div',
              { className: 'lr-note-banner vault' },
              h(Icon, { name: 'note', size: 13 }),
              h(
                'span',
                null,
                t('noteVaultBanner').split('{time}').join(vaultState.time || ''),
              ),
              h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: openVaultPreview },
                h(Icon, { name: 'quote', size: 12 }),
                t('noteVaultView'),
              ),
              onOpenObsidian
                ? h(
                    'button',
                    { type: 'button', className: 'lr-btn small', onClick: () => onOpenObsidian() },
                    h(Icon, { name: 'expand', size: 12 }),
                    t('openObsidian'),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-note-banner-close',
                  title: t('close'),
                  onClick: () => setVaultState((current) => (current ? { ...current, dismissed: true } : current)),
                },
                h(Icon, { name: 'close', size: 11 }),
              ),
            )
          : null,
        conflict
          ? h(
              'div',
              { className: 'lr-note-banner conflict' },
              h(Icon, { name: 'close', size: 13 }),
              h('span', null, t('noteConflictBody')),
              h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: reloadFromServer },
                t('noteConflictReload'),
              ),
              h(
                'button',
                { type: 'button', className: 'lr-btn small primary', onClick: () => saveSource(true) },
                t('noteConflictOverwrite'),
              ),
            )
          : null,
        h(
          'div',
          { className: `lr-note-stage${panelOpen ? ' panel-open' : ''}` },
          // Below 1100px the rail is an overlay, so a click on the paper has to
          // be able to dismiss it without hunting for the close button.
          panelOpen
            ? h('div', { className: 'lr-ann-panel-scrim', onClick: () => setPanelOpen(false) })
            : null,
          h(
            'div',
            { className: 'lr-note-scroll', ref: scrollRef },
            h(
              'div',
              { className: 'lr-note-paper-wrap', ref: paperWrapRef },
              mode === 'edit'
                ? h(NoteEditor, {
                    value: draft,
                    onChange: onChangeSource,
                    onSave: () => saveSource(false),
                    onCancel: leaveEdit,
                    dirty,
                    saving: saveState === 'saving',
                    error: saveError,
                    draftOffer,
                    onRestoreDraft: () => {
                      if (!draftOffer) return
                      setDraft(draftOffer.markdown)
                      setDirty(draftOffer.markdown !== markdown)
                      setSaveState(draftOffer.markdown === markdown ? 'saved' : 'unsaved')
                      setDraftOffer(null)
                    },
                    onDiscardDraft: () => {
                      if (paperId) clearNoteDraft(paperId)
                      setDraftOffer(null)
                    },
                    onInsertImage: openInsert,
                    onCursor: setAnchorOffset,
                  })
                : h(
                    'article',
                    { className: 'lr-note-paper' },
                    markdown.trim()
                      ? h(MarkdownDoc, {
                          text: markdown,
                          parsed,
                          paperId,
                          annotations,
                          onCite: onCitePage,
                          onAnnPick: onPickAnnotation,
                          onImage: (src, alt) => setLightbox({ src, alt }),
                        })
                      : h(
                          'div',
                          { className: 'lr-note-paper-empty' },
                          h(Icon, { name: 'note', size: 24 }),
                          h('div', null, t('noteEmptyBody')),
                          h('div', { className: 'lr-note-paper-empty-hint' }, t('noteEmptyHint')),
                          onRegenerate
                            ? h(
                                'button',
                                { type: 'button', className: 'lr-btn small primary', onClick: onRegenerate },
                                h(Icon, { name: 'sparkle', size: 12 }),
                                t('noteGenerate'),
                              )
                            : null,
                        ),
                  ),
              mode === 'preview'
                ? h(NoteSelectionToolbar, {
                    toolbar,
                    onAnnotate: () => {
                      const pending = pendingRef.current
                      if (!pending) return
                      setDialog({
                        id: '',
                        quote: pending.quote,
                        note: '',
                        color: 'amber',
                        from: pending.from,
                        to: pending.to,
                      })
                      setToolbar(null)
                    },
                    onDismiss: () => {
                      setToolbar(null)
                      pendingRef.current = null
                      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
                      selection?.removeAllRanges?.()
                    },
                  })
                : null,
            ),
          ),
          mode === 'preview'
            ? h(NoteAnnotationPanel, {
                annotations,
                open: panelOpen,
                collapsed: false,
                onToggle: () => {},
                onClose: () => setPanelOpen(false),
                onLocate: (id) => scrollToAnnotation(id),
                onEdit: editAnnotation,
                onDelete: async (id) => {
                  if (!window.confirm(t('noteAnnDeleteConfirm'))) return
                  try {
                    await deleteAnnotation(id)
                  } catch (error) {
                    showToast?.(safeError(error) || t('noteAnnSaveFailed'), 'error')
                  }
                },
              })
            : null,
        ),
        mode === 'preview'
          ? h(NoteApplyBar, {
              pendingCount: openAnnotations.length,
              running: Boolean(applying),
              label: applying ? applying.label : '',
              instruction,
              onInstruction: setInstruction,
              onApply: applyAnnotations,
              onOpenPanel: () => setPanelOpen(true),
              orphanCount,
              disabled: false,
            })
          : null,
        figures
          ? h(
              'div',
              { className: 'lr-note-progress' },
              h(Spinner, { size: 13 }),
              h('span', null, figures.label || t('noteFiguresRunning')),
              h(
                'span',
                { className: 'lr-note-progress-count' },
                `${Math.min(figures.done, figures.total)}/${figures.total}`,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-btn small',
                  onClick: () => figuresAbort.current?.abort(),
                },
                t('stop'),
              ),
            )
          : null,
        annotationForDialog
          ? h(NoteAnnotationDialog, {
              draft: annotationForDialog,
              onClose: () => setDialog(null),
              onLocate: (id) => {
                setDialog(null)
                scrollToAnnotation(id)
              },
              onSave: saveAnnotation,
              onDelete: async (id) => {
                try {
                  await deleteAnnotation(id)
                } catch (error) {
                  throw error
                }
              },
            })
          : null,
        insertOpen
          ? h(NoteInsertDialog, {
              paper,
              markdown,
              anchorOffset,
              onClose: () => setInsertOpen(false),
              onInserted: onInserted,
              showToast,
            })
          : null,
        h(NoteHistoryDrawer, {
          open: historyOpen,
          loading: historyLoading,
          versions: historyVersions,
          error: historyError,
          busy: false,
          onClose: () => setHistoryOpen(false),
          onPreview: previewHistory,
          onRestore: restoreHistory,
        }),
        historyPreview
          ? h(
              Modal,
              {
                title: t('noteHistoryPreviewTitle'),
                subtitle: historyPreview.title,
                onClose: () => setHistoryPreview(null),
                wide: true,
              },
              historyPreview.loading
                ? h('div', { className: 'lr-modal-loading' }, h(Spinner, { size: 18 }), t('noteHistoryLoading'))
                : h(
                    'div',
                    { className: 'lr-note-preview' },
                    h(MarkdownDoc, { text: historyPreview.markdown, paperId }),
                    h(
                      'div',
                      { className: 'lr-note-preview-actions' },
                      h('span', { className: 'lr-note-preview-note' }, t('noteHistoryPreviewReadOnly')),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lr-btn small primary',
                          onClick: () => {
                            const item = historyPreview.item
                            setHistoryPreview(null)
                            restoreHistory(item)
                          },
                        },
                        h(Icon, { name: 'undo', size: 13 }),
                        t('noteHistoryRestore'),
                      ),
                    ),
                  ),
            )
          : null,
        // Same read-only shape as the history preview, so it costs no new layout.
        vaultPreview?.open
          ? h(
              Modal,
              {
                title: t('noteVaultTitle'),
                subtitle: vaultPreview.updatedAt ? noteFormatTime(vaultPreview.updatedAt) : '',
                onClose: () => setVaultPreview(null),
                wide: true,
              },
              vaultPreview.loading
                ? h('div', { className: 'lr-modal-loading' }, h(Spinner, { size: 18 }), t('noteHistoryLoading'))
                : vaultPreview.error
                  ? h('div', { className: 'lr-note-vault-missing' }, h(Icon, { name: 'note', size: 18 }), vaultPreview.error)
                  : h(
                      'div',
                      { className: 'lr-note-preview' },
                      h(MarkdownDoc, { text: vaultPreview.markdown, paperId }),
                      h(
                        'div',
                        { className: 'lr-note-preview-actions' },
                        h('span', { className: 'lr-note-preview-note' }, t('noteVaultReadOnly')),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lr-btn small primary',
                            onClick: () => {
                              const text = vaultPreview.markdown || ''
                              const done = () => showToast?.(t('noteVaultCopied'), 'ok')
                              const fail = () => showToast?.(t('noteVaultCopyFailed'), 'error')
                              try {
                                const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null
                                if (clip && typeof clip.writeText === 'function') {
                                  clip.writeText(text).then(done).catch(fail)
                                  return
                                }
                              } catch {
                                // fall through to the manual fallback
                              }
                              fail()
                            },
                          },
                          h(Icon, { name: 'note', size: 13 }),
                          t('noteVaultCopy'),
                        ),
                      ),
                    ),
            )
          : null,
        lightbox ? h(NoteLightbox, { image: lightbox, onClose: () => setLightbox(null) }) : null,
      )
    }


    // ── Reader note preview: Markdown + `$…$` / `$$…$$` (spec §7.4) ──────────

    function readerNotePreviewInline(inline, prefix) {
      const out = []
      const runs = Array.isArray(inline) ? inline : []
      runs.forEach((run, index) => {
        if (!run) return
        const key = `${prefix}-${index}`
        const text = typeof run.text === 'string' ? run.text : ''
        if (run.type === 'strong') {
          out.push(h('strong', { key }, ...renderMathSegmentsInline(text, `${key}-s`)))
          return
        }
        if (run.type === 'em') {
          out.push(h('em', { key }, ...renderMathSegmentsInline(text, `${key}-e`)))
          return
        }
        if (run.type === 'code') {
          out.push(h('code', { key, className: 'lr-note-code' }, text))
          return
        }
        if (run.type === 'link') {
          out.push(
            h(
              'a',
              {
                key,
                className: 'lr-note-link-inline',
                href: run.href || '#',
                target: '_blank',
                rel: 'noreferrer',
                onClick: (event) => event.preventDefault(),
              },
              ...renderMathSegmentsInline(text, `${key}-l`),
            ),
          )
          return
        }
        out.push(...renderMathSegmentsInline(text, key))
      })
      return out
    }

    // `$…$` becomes an inline math node; `$$…$$` inside a text run still renders
    // (it usually arrives as its own paragraph, handled below).
    function renderMathSegmentsInline(text, prefix) {
      const segments = splitMathSegments(text)
      if (!segments) return [String(text || '')]
      return segments.map((segment, index) => {
        const key = `${prefix}-${index}`
        if (segment.type === 'text') return segment.value
        return h(
          'span',
          { key, className: `lr-math-holder${segment.display ? ' is-display' : ''}` },
          renderMath(segment.source, { display: segment.display }),
        )
      })
    }

    // A paragraph that is nothing but `$$…$$` renders as centred display maths.
    function readerNoteDisplayMath(block) {
      const runs = Array.isArray(block.inline) ? block.inline : []
      if (runs.length !== 1 || runs[0]?.type !== 'text') return null
      const raw = String(runs[0].text || '').trim()
      const match = /^\$\$([\s\S]+)\$\$$/.exec(raw)
      return match ? match[1] : null
    }

    /**
     * Render the reader-note preview. Deliberately separate from `MarkdownDoc`:
     * the note preview needs maths, the summary document never does (spec §15.9).
     */
    function renderReaderNotePreview(markdown, paperId) {
      const parsed = parseMarkdown(markdown || '')
      const out = []
      const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : []
      blocks.forEach((block, index) => {
        if (!block) return
        const key = `np-${index}`
        if (block.type === 'heading') {
          const level = Math.max(1, Math.min(4, Number(block.level) || 1))
          out.push(
            h(
              `h${level}`,
              { key, className: `lr-note-h lr-note-h${level}` },
              ...readerNotePreviewInline(block.inline, key),
            ),
          )
          return
        }
        if (block.type === 'paragraph') {
          const math = readerNoteDisplayMath(block)
          if (math !== null) {
            out.push(h('div', { key, className: 'lr-note-math-block' }, renderMath(math, { display: true })))
            return
          }
          out.push(h('p', { key, className: 'lr-note-p' }, ...readerNotePreviewInline(block.inline, key)))
          return
        }
        if (block.type === 'list') {
          const items = Array.isArray(block.items) ? block.items : []
          out.push(
            h(
              block.ordered ? 'ol' : 'ul',
              { key, className: 'lr-note-doc-list' },
              items.map((item, itemIndex) =>
                h(
                  'li',
                  { key: `${key}-${itemIndex}` },
                  ...readerNotePreviewInline(item.inline, `${key}-${itemIndex}`),
                ),
              ),
            ),
          )
          return
        }
        if (block.type === 'quote') {
          out.push(h('blockquote', { key, className: 'lr-note-quote' }, ...renderReaderNoteQuote(block.blocks, key)))
          return
        }
        if (block.type === 'code') {
          out.push(h('pre', { key, className: 'lr-note-pre' }, h('code', null, String(block.text || ''))))
          return
        }
        if (block.type === 'image') {
          const src = resolveNoteFigureSrc(block.src, paperId)
          out.push(
            h(
              'figure',
              { key, className: 'lr-note-figure' },
              src ? h('img', { src, alt: block.alt || '', loading: 'lazy' }) : null,
              block.alt ? h('figcaption', null, block.alt) : null,
            ),
          )
          return
        }
        if (block.type === 'table') {
          const header = Array.isArray(block.header) ? block.header : []
          const rows = Array.isArray(block.rows) ? block.rows : []
          out.push(
            h(
              'div',
              { key, className: 'lr-note-table-wrap' },
              h(
                'table',
                { className: 'lr-note-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    header.map((cell, cellIndex) =>
                      h(
                        'th',
                        { key: `${key}-h-${cellIndex}` },
                        ...readerNotePreviewInline(cell, `${key}-h${cellIndex}`),
                      ),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  rows.map((row, rowIndex) =>
                    h(
                      'tr',
                      { key: `${key}-r-${rowIndex}` },
                      (row || []).map((cell, cellIndex) =>
                        h(
                          'td',
                          { key: `${key}-r${rowIndex}-c${cellIndex}` },
                          ...readerNotePreviewInline(cell, `${key}-r${rowIndex}c${cellIndex}`),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
          return
        }
        if (block.type === 'hr') out.push(h('hr', { key, className: 'lr-note-hr' }))
      })
      return out
    }

    function renderReaderNoteQuote(blocks, prefix) {
      const out = []
      const list = Array.isArray(blocks) ? blocks : []
      list.forEach((block, index) => {
        if (!block || block.type !== 'paragraph') return
        const key = `${prefix}-q${index}`
        out.push(h('p', { key, className: 'lr-note-p' }, ...readerNotePreviewInline(block.inline, key)))
      })
      return out
    }

    // ── Record panel (spec §7.2) ────────────────────────────────────────────

    // Snapshot reasons written by the host (spec §3.5): append / organize /
    // resolve / restore. Anything unrecognised reads as a manual save rather
    // than showing a raw English token to the reader.
    const READER_NOTE_HISTORY_REASONS = {
      append: 'readerNoteHistorySourceAppend',
      organize: 'readerNoteHistorySourceOrganize',
      resolve: 'readerNoteHistorySourceResolve',
      restore: 'readerNoteHistorySourceRestore',
    }

    function readerNoteHistoryLabel(reason) {
      const key = READER_NOTE_HISTORY_REASONS[String(reason || '').toLowerCase()]
      return t(key || 'readerNoteHistorySourceManual')
    }

    // The drawer works off a plain, always-shaped list so a partial payload
    // cannot crash the render.
    function readerNoteHistoryList(versions) {
      return (Array.isArray(versions) ? versions : []).map((item) => ({
        stamp: String(item?.stamp || ''),
        updatedAt: String(item?.updatedAt || ''),
        chars: Number(item?.chars) || 0,
        reason: String(item?.reason || ''),
      }))
    }

    // Shared by the toolbar and the shortcut help so a hint can never drift
    // from the key it documents.
    const READER_NOTE_TOOLS = [
      { command: 'bold', glyph: 'B', label: 'readerNoteBold', keys: 'Ctrl+B', strong: true },
      { command: 'italic', glyph: 'I', label: 'readerNoteItalic', keys: 'Ctrl+I', italic: true },
      { command: 'link', glyph: '链接', label: 'readerNoteLink', keys: 'Ctrl+K' },
      { command: 'h1', glyph: 'H1', label: 'readerNoteH1', keys: 'Ctrl+1' },
      { command: 'h2', glyph: 'H2', label: 'readerNoteH2', keys: 'Ctrl+2' },
      { command: 'h3', glyph: 'H3', label: 'readerNoteH3', keys: 'Ctrl+3' },
      { command: 'ul', glyph: '•', label: 'readerNoteBullet', keys: 'Ctrl+Shift+8' },
      { command: 'ol', glyph: '1.', label: 'readerNoteOrdered', keys: 'Ctrl+Shift+7' },
      { command: 'quote', glyph: '❝', label: 'readerNoteQuote', keys: 'Ctrl+Shift+Q' },
      { command: 'code', glyph: '<>', label: 'readerNoteCode', keys: 'Ctrl+Shift+`' },
      { command: 'math', glyph: '∑', label: 'readerNoteMath', keys: 'Ctrl+M' },
      { command: 'mathBlock', glyph: '∫', label: 'readerNoteMathBlock', keys: 'Ctrl+Shift+M' },
    ]

    const READER_NOTE_SHORTCUTS = [
      ['readerNoteShortcutBold', 'Ctrl+B'],
      ['readerNoteShortcutItalic', 'Ctrl+I'],
      ['readerNoteShortcutLink', 'Ctrl+K'],
      ['readerNoteShortcutHeading', 'Ctrl+1 / 2 / 3'],
      ['readerNoteShortcutBody', 'Ctrl+0'],
      ['readerNoteShortcutBullet', 'Ctrl+Shift+8'],
      ['readerNoteShortcutOrdered', 'Ctrl+Shift+7'],
      ['readerNoteShortcutQuote', 'Ctrl+Shift+Q'],
      ['readerNoteShortcutCode', 'Ctrl+Shift+`'],
      ['readerNoteShortcutMath', 'Ctrl+M'],
      ['readerNoteShortcutMathBlock', 'Ctrl+Shift+M'],
      ['readerNoteShortcutImage', 'Ctrl+Shift+I'],
      ['readerNoteShortcutFontUp', 'Ctrl+='],
      ['readerNoteShortcutFontDown', 'Ctrl+-'],
      ['readerNoteShortcutFontReset', 'Ctrl+Shift+0'],
      ['readerNoteShortcutRecord', 'Ctrl+Enter'],
      ['readerNoteShortcutClose', 'Esc'],
    ]

    /**
     * Narrow screens get a full-page editor (spec §14.1); the CSS media query
     * and this flag therefore share one breakpoint constant.
     */
    function useReaderNoteNarrow() {
      const [narrow, setNarrow] = useState(() => {
        try {
          if (typeof window === 'undefined') return false
          if (typeof window.matchMedia === 'function') {
            return Boolean(window.matchMedia(`(max-width: ${READER_NOTE_NARROW}px)`).matches)
          }
          return Number(window.innerWidth) <= READER_NOTE_NARROW
        } catch {
          return false
        }
      })
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const query = window.matchMedia(`(max-width: ${READER_NOTE_NARROW}px)`)
        const onChange = (event) => setNarrow(Boolean(event?.matches ?? query.matches))
        if (typeof query.addEventListener === 'function') {
          query.addEventListener('change', onChange)
          return () => query.removeEventListener('change', onChange)
        }
        // Safari < 14 only ships the legacy listener API.
        if (typeof query.addListener === 'function') {
          query.addListener(onChange)
          return () => query.removeListener(onChange)
        }
        return undefined
      }, [])
      return narrow
    }

    /**
     * Apply one keydown inside the record textarea. Returns `{handled:false}`
     * for keys the textarea should keep handling itself.
     */
    function applyReaderNoteKey({ event, text, start, end, font }) {
      const action = readerNoteCommandForKey(event)
      if (!action) return { handled: false }
      if (action.action === 'submit') return { handled: true, action: 'submit' }
      if (action.action === 'close') return { handled: true, action: 'close' }
      if (action.action === 'fontUp') return { handled: true, action: 'fontUp', font: stepReaderNoteFont(font, 1) }
      if (action.action === 'fontDown') return { handled: true, action: 'fontDown', font: stepReaderNoteFont(font, -1) }
      if (action.action === 'fontReset') return { handled: true, action: 'fontReset', font: 100 }
      if (action.command === 'image') return { handled: true, action: 'image' }
      const result = applyMarkdownCommand({ text, start, end, command: action.command })
      return { handled: true, command: action.command, text: result.text, start: result.start, end: result.end }
    }

    function readImageFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
    }

    /**
     * The record panel. It never talks to the vault itself: the host owns every
     * HTTP call, the panel owns the editing surface.
     */
    function ReaderNoteDock({
      open,
      narrow,
      paperId,
      height = READER_NOTE_DOCK_DEFAULT,
      font = 100,
      submitting = false,
      onFontChange,
      onHeightChange,
      onSubmit,
      onClose,
      onUploadImage,
      onToast,
      onHistory,
    }) {
      const [text, setText] = useState(() => readReaderNoteDraft(paperId))
      const [mode, setMode] = useState('write')
      const [help, setHelp] = useState(false)
      const [uploading, setUploading] = useState(false)
      const [dragHeight, setDragHeight] = useState(0)
      const areaRef = useRef(null)
      const selectionRef = useRef({ start: 0, end: 0 })

      // New paper while the panel is open: swap in that paper's own draft.
      useEffect(() => {
        if (!open) return
        setText(readReaderNoteDraft(paperId))
        selectionRef.current = { start: 0, end: 0 }
      }, [open, paperId])

      // Debounced draft write (spec §7.2): 400 ms after the last keystroke.
      useEffect(() => {
        if (!open || !paperId) return undefined
        const timer = setTimeout(() => writeReaderNoteDraft(paperId, text), READER_NOTE_DRAFT_DEBOUNCE)
        return () => clearTimeout(timer)
      }, [open, paperId, text])

      const applyResult = (result) => {
        setText(result.text)
        selectionRef.current = { start: result.start, end: result.end }
        if (typeof requestAnimationFrame !== 'function') return
        requestAnimationFrame(() => {
          const area = areaRef.current
          if (!area) return
          try {
            area.focus()
            area.setSelectionRange(result.start, result.end)
          } catch {
            // selection is cosmetic; never let it break editing
          }
        })
      }

      const insertText = (snippet) => {
        const { start, end } = selectionRef.current
        const next = `${text.slice(0, start)}${snippet}${text.slice(end)}`
        applyResult({ text: next, start: start + snippet.length, end: start + snippet.length })
      }

      async function uploadImageFile(file) {
        if (!file || uploading) return
        if (!/^image\/(png|jpeg)$/i.test(file.type || '')) {
          onToast?.(t('readerNoteImageType'), 'bad')
          return
        }
        if (file.size > 8 * 1024 * 1024) {
          onToast?.(t('readerNoteImageTooLarge'), 'bad')
          return
        }
        setUploading(true)
        try {
          const dataUrl = await readImageFileAsDataUrl(file)
          const result = await onUploadImage?.({ dataUrl, name: file.name || '' })
          const rel = result?.rel || ''
          if (!rel) throw new Error(t('readerNoteImageFailed'))
          insertText(`![](${rel})`)
          if (result?.vaultError) onToast?.(String(result.vaultError), 'bad')
        } catch (uploadError) {
          onToast?.(safeError(uploadError) || t('readerNoteImageFailed'), 'bad')
        } finally {
          setUploading(false)
        }
      }

      function startImageUpload() {
        if (uploading || typeof onUploadImage !== 'function') return
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/png,image/jpeg'
        input.onchange = () => {
          const file = input.files && input.files[0]
          if (file) uploadImageFile(file)
        }
        input.click()
      }

      const runCommand = (command) => {
        if (command === 'image') {
          startImageUpload()
          return
        }
        const area = areaRef.current
        // Read the live selection from the textarea: a click into the editor
        // updates it, and the tracked value can lag behind a drag-select.
        if (area && typeof area.selectionStart === 'number') {
          selectionRef.current = {
            start: area.selectionStart,
            end: typeof area.selectionEnd === 'number' ? area.selectionEnd : area.selectionStart,
          }
        }
        applyResult(
          applyMarkdownCommand({
            text,
            start: selectionRef.current.start,
            end: selectionRef.current.end,
            command,
          }),
        )
      }

      function handlePaste(event) {
        const items = event?.clipboardData?.items
        if (!items) return
        for (const item of items) {
          if (item.kind !== 'file' || !/^image\//.test(item.type || '')) continue
          const file = item.getAsFile?.()
          if (!file) continue
          event.preventDefault()
          uploadImageFile(file)
          return
        }
      }

      function submit() {
        if (submitting) return
        if (!String(text || '').trim()) {
          onToast?.(t('readerNoteEmpty'), 'bad')
          return
        }
        onSubmit?.(text)
      }

      function cancel() {
        if (String(text || '').trim() && typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm(t('readerNoteCancelConfirm'))) return
        }
        clearReaderNoteDraft(paperId)
        setText('')
        selectionRef.current = { start: 0, end: 0 }
        onClose?.()
      }

      function handleKeyDown(event) {
        const result = applyReaderNoteKey({
          event,
          text,
          start: event.currentTarget?.selectionStart ?? selectionRef.current.start,
          end: event.currentTarget?.selectionEnd ?? selectionRef.current.end,
          font,
        })
        if (!result.handled) {
          if (event.key === 'Tab') {
            event.preventDefault()
            insertText('  ')
          }
          return
        }
        event.preventDefault()
        if (result.action === 'submit') {
          submit()
          return
        }
        if (result.action === 'close') {
          cancel()
          return
        }
        if (result.action === 'image') {
          startImageUpload()
          return
        }
        if (result.action === 'fontUp' || result.action === 'fontDown' || result.action === 'fontReset') {
          onFontChange?.(result.font)
          return
        }
        if (result.command) applyResult(result)
      }

      // Drag the top edge (spec §7.2). The live value stays local so the drag
      // follows the pointer; only the release writes localStorage.
      const liveHeight = dragHeight || Number(height) || READER_NOTE_DOCK_DEFAULT
      function beginResize(event) {
        if (narrow || !event) return
        const startY = event.clientY
        const startHeight = liveHeight
        const viewport = (typeof window !== 'undefined' && window.innerHeight) || 800
        const maxHeight = Math.max(READER_NOTE_DOCK_MIN, Math.round(viewport * 0.6))
        let final = startHeight
        event.preventDefault?.()
        const move = (moveEvent) => {
          final = Math.max(
            READER_NOTE_DOCK_MIN,
            Math.min(maxHeight, startHeight - (moveEvent.clientY - startY)),
          )
          setDragHeight(Math.round(final))
        }
        const end = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', end)
          window.removeEventListener('pointercancel', end)
          setDragHeight(0)
          if (final !== startHeight) onHeightChange?.(Math.round(final), true)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', end)
        window.addEventListener('pointercancel', end)
      }

      if (!open) return null

      const words = noteWordCount(text)
      const fontPercent = clampReaderNoteFont(font)

      const toolbar = h(
        'div',
        { className: 'lr-note-dock-tools' },
        ...READER_NOTE_TOOLS.map((tool) =>
          h(
            'button',
            {
              key: tool.command,
              type: 'button',
              className: `lr-note-dock-tool${tool.strong ? ' is-strong' : ''}${tool.italic ? ' is-italic' : ''}`,
              title: `${t(tool.label)} (${tool.keys})`,
              'aria-label': t(tool.label),
              // Keep the textarea selection: a mousedown would collapse it.
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => runCommand(tool.command),
            },
            tool.glyph,
          ),
        ),
        h('span', { className: 'lr-note-dock-sep' }),
        h(
          'button',
          {
            type: 'button',
            className: 'lr-note-dock-tool',
            title: `${t('readerNoteImage')} (Ctrl+Shift+I)`,
            'aria-label': t('readerNoteImage'),
            disabled: uploading,
            onMouseDown: (event) => event.preventDefault(),
            onClick: startImageUpload,
          },
          uploading ? h(Spinner, { size: 12 }) : h(Icon, { name: 'upload', size: 13 }),
        ),
        h(
          'div',
          { className: 'lr-note-dock-font' },
          h(
            'button',
            {
              type: 'button',
              className: 'lr-note-dock-tool',
              title: `${t('readerNoteShortcutFontDown')} (Ctrl+-)`,
              'aria-label': t('readerNoteShortcutFontDown'),
              onClick: () => onFontChange?.(stepReaderNoteFont(fontPercent, -1)),
            },
            h(Icon, { name: 'minus', size: 12 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'lr-note-dock-font-value',
              title: t('readerNoteResetFont'),
              onClick: () => onFontChange?.(100),
            },
            `${fontPercent}%`,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'lr-note-dock-tool',
              title: `${t('readerNoteShortcutFontUp')} (Ctrl+=)`,
              'aria-label': t('readerNoteShortcutFontUp'),
              onClick: () => onFontChange?.(stepReaderNoteFont(fontPercent, 1)),
            },
            h(Icon, { name: 'plus', size: 12 }),
          ),
        ),
        h('span', { className: 'lr-note-dock-spacer' }),
        h(
          'div',
          { className: 'lr-note-dock-modes' },
          h(
            'button',
            {
              type: 'button',
              className: `lr-note-dock-mode${mode === 'write' ? ' active' : ''}`,
              onClick: () => setMode('write'),
            },
            t('readerNoteWrite'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: `lr-note-dock-mode${mode === 'preview' ? ' active' : ''}`,
              onClick: () => setMode('preview'),
            },
            t('readerNotePreview'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'lr-note-dock-tool',
              title: t('readerNoteShortcuts'),
              'aria-label': t('readerNoteShortcuts'),
              onClick: () => setHelp((value) => !value),
            },
            '?',
          ),
        ),
      )

      const editor = h('textarea', {
        ref: areaRef,
        className: 'lr-note-dock-input',
        value: text,
        spellCheck: false,
        style: { fontSize: `calc(12.5px * ${fontPercent / 100})` },
        placeholder: t('readerNotePlaceholder'),
        onChange: (event) => {
          setText(event.target.value)
          selectionRef.current = {
            start: event.target.selectionStart ?? 0,
            end: event.target.selectionEnd ?? 0,
          }
        },
        onSelect: (event) => {
          selectionRef.current = {
            start: event.currentTarget.selectionStart ?? 0,
            end: event.currentTarget.selectionEnd ?? 0,
          }
        },
        onKeyDown: handleKeyDown,
        onPaste: handlePaste,
      })

      const preview = h(
        'div',
        { className: 'lr-note-dock-preview', style: { fontSize: `calc(12.5px * ${fontPercent / 100})` } },
        String(text || '').trim()
          ? renderReaderNotePreview(text, paperId)
          : h('div', { className: 'lr-note-dock-empty' }, t('readerNotePreviewEmpty')),
      )

      const helpPanel = help
        ? h(
            'div',
            { className: 'lr-note-dock-help' },
            h('div', { className: 'lr-note-dock-help-title' }, t('readerNoteShortcutsTitle')),
            h(
              'div',
              { className: 'lr-note-dock-help-grid' },
              ...READER_NOTE_SHORTCUTS.map(([key, accel]) =>
                h('div', { className: 'lr-note-dock-help-row', key }, h('span', null, t(key)), h('kbd', null, accel)),
              ),
            ),
          )
        : null

      const footer = h(
        'div',
        { className: 'lr-note-dock-foot' },
        h('span', { className: 'lr-note-dock-words' }, readerNoteText('readerNoteWords', { count: words })),
        h('span', { className: 'lr-note-dock-spacer' }),
        h('button', { type: 'button', className: 'lr-btn small', onClick: cancel, disabled: submitting }, t('cancel')),
        h(
          'button',
          { type: 'button', className: 'lr-btn small primary', onClick: submit, disabled: submitting },
          submitting ? h(Spinner, { size: 12 }) : h(Icon, { name: 'check', size: 13 }),
          submitting ? t('readerNoteSubmitting') : t('readerNoteSubmit'),
          h('kbd', { className: 'lr-note-dock-kbd' }, 'Ctrl+↵'),
        ),
      )

      // Narrow (≤860px): a full-page editor, not an overlay (spec §14.1).
      // Both heads carry it: the dock is where the reader is when 整理笔记 has
      // just rewritten the body (spec §7.6)。
      const historyButton = h(
        'button',
        {
          type: 'button',
          className: 'lr-btn icon',
          onClick: onHistory,
          title: t('readerNoteHistory'),
          'aria-label': t('readerNoteHistory'),
        },
        h(Icon, { name: 'refresh', size: 14 }),
      )

      if (narrow) {
        return h(
          'section',
          {
            className: 'lr-note-dock lr-note-dock-full',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('readerNoteDockTitle'),
          },
          h(
            'div',
            { className: 'lr-note-dock-head' },
            h(Icon, { name: 'note', size: 14 }),
            h('span', { className: 'lr-note-dock-title' }, t('readerNoteDockTitle')),
            h('span', { className: 'lr-note-dock-hint' }, t('readerNoteDockHint')),
            h('span', { className: 'lr-note-dock-spacer' }),
            historyButton,
            h(
              'button',
              { type: 'button', className: 'lr-btn small primary', onClick: submit, disabled: submitting },
              submitting ? h(Spinner, { size: 12 }) : h(Icon, { name: 'check', size: 13 }),
              submitting ? t('readerNoteSubmitting') : t('readerNoteSubmit'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn icon',
                onClick: cancel,
                title: t('readerNoteClose'),
                'aria-label': t('readerNoteClose'),
              },
              h(Icon, { name: 'close', size: 14 }),
            ),
          ),
          toolbar,
          helpPanel,
          h('div', { className: 'lr-note-dock-body full' }, mode === 'write' ? editor : preview),
          footer,
        )
      }

      // Wide: a flex sibling below `lr-split`, so the PDF and the chat both
      // shrink instead of being covered (spec §7.2).
      return h(
        'section',
        {
          className: 'lr-note-dock',
          style: { height: `${Math.max(READER_NOTE_DOCK_MIN, liveHeight)}px` },
          'aria-label': t('readerNoteDockTitle'),
        },
        h(
          'div',
          {
            className: 'lr-note-dock-resize',
            role: 'separator',
            'aria-orientation': 'horizontal',
            title: t('readerNoteDockResize'),
            onPointerDown: beginResize,
            onDoubleClick: () => onHeightChange?.(READER_NOTE_DOCK_DEFAULT, true),
          },
          h('span', { className: 'lr-note-dock-grip' }),
        ),
        h(
          'div',
          { className: 'lr-note-dock-head' },
          h(Icon, { name: 'note', size: 14 }),
          h('span', { className: 'lr-note-dock-title' }, t('readerNoteDockTitle')),
          h('span', { className: 'lr-note-dock-hint' }, t('readerNoteDockHint')),
          h('span', { className: 'lr-note-dock-spacer' }),
          historyButton,
          h(
            'button',
            {
              type: 'button',
              className: 'lr-btn icon',
              onClick: onClose,
              title: t('readerNoteClose'),
              'aria-label': t('readerNoteClose'),
            },
            h(Icon, { name: 'close', size: 14 }),
          ),
        ),
        toolbar,
        helpPanel,
        h('div', { className: `lr-note-dock-body${mode === 'preview' ? ' preview-only' : ''}` }, editor, preview),
        footer,
      )
    }

    // ── 「整理笔记」question confirmation (spec §7.5) ────────────────────────

    function ReaderNoteQuestionsDialog({ questions, busyId, replies, onClose, onDiscuss, onAskInChat, onResolve }) {
      const [drafts, setDrafts] = useState({})
      const list = Array.isArray(questions) ? questions : []
      const pending = list.filter((item) => item && item.status === 'open')
      return h(
        Modal,
        {
          title: t('readerNoteQuestionsTitle'),
          subtitle: t('readerNoteQuestionsSubtitle'),
          onClose,
          wide: true,
        },
        h(
          'div',
          { className: 'lr-note-questions' },
          pending.length === 0
            ? h(
                'div',
                { className: 'lr-note-questions-empty' },
                h(Icon, { name: 'check', size: 15 }),
                h('span', null, t('readerNoteQuestionsAllDone')),
              )
            : null,
          ...pending.map((question, index) =>
            h(
              'article',
              { className: 'lr-note-question', key: question.id || `q-${index}` },
              h(
                'div',
                { className: 'lr-note-question-quote' },
                h(Icon, { name: 'quote', size: 12 }),
                h('q', null, question.quote || ''),
              ),
              question.problem ? h('div', { className: 'lr-note-question-problem' }, question.problem) : null,
              question.ask
                ? h(
                    'div',
                    { className: 'lr-note-question-ask' },
                    h('span', { className: 'lr-note-question-label' }, t('readerNoteQuestionAsk')),
                    question.ask,
                  )
                : null,
              // Discussion history lives on the question (`messages`, spec §3.7),
              // so it survives reopening the dialog; the local map only holds the
              // turns added in this session while the stream is still running.
              (() => {
                const persisted = Array.isArray(question.messages) ? question.messages : []
                const session = Array.isArray(replies?.[question.id]) ? replies[question.id] : []
                const thread = persisted.length > 0 ? persisted : session
                if (thread.length === 0) return null
                return h(
                  'div',
                  { className: 'lr-note-question-thread' },
                  ...thread.map((message, messageIndex) =>
                    h(
                      'div',
                      {
                        className: `lr-note-question-msg ${message.role === 'user' ? 'user' : 'ai'}`,
                        key: messageIndex,
                      },
                      String(message.content || ''),
                    ),
                  ),
                )
              })(),
              h('textarea', {
                className: 'lr-note-question-input',
                value: drafts[question.id] || '',
                placeholder: t('readerNoteQuestionPlaceholder'),
                spellCheck: false,
                onChange: (event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value })),
              }),
              h(
                'div',
                { className: 'lr-note-question-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn small',
                    disabled: busyId === question.id,
                    onClick: () => onDiscuss?.(question, drafts[question.id] || ''),
                  },
                  busyId === question.id ? h(Spinner, { size: 12 }) : h(Icon, { name: 'sparkle', size: 12 }),
                  busyId === question.id ? t('readerNoteQuestionDiscussing') : t('readerNoteQuestionDiscuss'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'lr-btn small', onClick: () => onAskInChat?.(question) },
                  h(Icon, { name: 'arrowUp', size: 12 }),
                  t('readerNoteQuestionAskInChat'),
                ),
                h('span', { className: 'lr-note-dock-spacer' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn small',
                    disabled: busyId === question.id,
                    onClick: () => onResolve?.(question, 'dismiss'),
                  },
                  t('readerNoteQuestionDismiss'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn small primary',
                    disabled: busyId === question.id,
                    onClick: () => onResolve?.(question, 'apply'),
                  },
                  t('readerNoteQuestionApply'),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'lr-note-questions-foot' },
            h('span', { className: 'lr-note-dock-spacer' }),
            h('button', { type: 'button', className: 'lr-btn small', onClick: onClose }, t('close')),
          ),
        ),
      )
    }

    function LiteratureReader() {
      const [papers, setPapers] = useState([])
      const [paper, setPaper] = useState(null)
      const [messages, setMessages] = useState([])
      const [annotations, setAnnotations] = useState([])
      const [currentPage, setCurrentPage] = useState(1)
      const [mode, setMode] = useState('select')
      const [penColor, setPenColor] = useState('#f6c945')
      const [penWidth, setPenWidth] = useState(() =>
        storedNumber('dsh.literature.penWidth.v1', 12, 1, 24),
      )
      const [selection, setSelection] = useState(null)
      const [showBubble, setShowBubble] = useState(true)
      const [question, setQuestion] = useState('')
      const [sending, setSending] = useState(false)
      const [summary, setSummary] = useState(null)
      // Pending glossary confirmation: { include, questions } while the dialog
      // is open. Null means no dialog.
      const [glossaryAsk, setGlossaryAsk] = useState(null)
      const [toast, setToast] = useState(null)
      const [error, setError] = useState('')
      const [booting, setBooting] = useState(true)
      const [view, setView] = useState('reader')
      const [importState, setImportState] = useState(null)
      const [pendingImportFolder, setPendingImportFolder] = useState('')
      const [vaultLibrary, setVaultLibrary] = useState(null)
      const [vaultLoading, setVaultLoading] = useState(false)
      const [vaultError, setVaultError] = useState('')
      const [vaultBusy, setVaultBusy] = useState('')
      const [splitPercent, setSplitPercent] = useState(() =>
        storedNumber('dsh.literature.split.v1', 74, 45, 82),
      )
      const [resizing, setResizing] = useState(false)
      const [eraserWidth, setEraserWidth] = useState(() =>
        storedNumber('dsh.literature.eraserWidth.v1', 18, 4, 48),
      )
      const [health, setHealth] = useState(null)
      const [analysisModal, setAnalysisModal] = useState(null)
      const [summaryModal, setSummaryModal] = useState(null)
      const [wordNotice, setWordNotice] = useState(null)
      const [expandedMessage, setExpandedMessage] = useState(null)
      const [zoom, setZoom] = useState(ZOOM_DEFAULT)
      const [chapterValue, setChapterValue] = useState('')
      const [rangeStart, setRangeStart] = useState(1)
      const [rangeEnd, setRangeEnd] = useState(1)
      const [outlineLoading, setOutlineLoading] = useState(false)
      const [retrying, setRetrying] = useState(false)
      const [streaming, setStreaming] = useState(null)
      const [modelPickerOpen, setModelPickerOpen] = useState(false)
      const [modelGroups, setModelGroups] = useState(EMPTY)
      const [modelLoading, setModelLoading] = useState(false)
      const [modelError, setModelError] = useState('')
      const [modelBusy, setModelBusy] = useState(false)
      // Reading text scale in percent. The chat pane and composer are the only
      // surfaces resized: the PDF viewer keeps its own zoom control.
      const [textScale, setTextScale] = useState(() =>
        storedNumber('dsh.literature.textScale.v1', 100, 70, 220),
      )
      // Page fullscreen: the whole document becomes the browser's fullscreen
      // element so host overlays survive. The state only drives the toolbar
      // icon; the browser owns the actual mode and its Esc exit.
      const [fullscreen, setFullscreen] = useState(false)
      // ── Reader note (docs/reader-note-spec.md §7) ──────────────────────────
      // `readerNote` mirrors GET /papers/:id/reader-note: null means "not asked
      // yet", `{ exists: false }` means the file is gone or never created.
      const [readerNote, setReaderNote] = useState(null)
      const [noteDock, setNoteDock] = useState(false)
      const [noteDockHeight, setNoteDockHeight] = useState(() => readerNoteDockHeight())
      const [noteFont, setNoteFont] = useState(() =>
        clampReaderNoteFont(storedNumber('dsh.literature.noteFont.v1', 100, READER_NOTE_FONT_MIN, READER_NOTE_FONT_MAX)),
      )
      const [noteSubmitting, setNoteSubmitting] = useState(false)
      const [noteCreating, setNoteCreating] = useState(false)
      const [noteOrganizing, setNoteOrganizing] = useState(false)
      const [noteOrganizeLabel, setNoteOrganizeLabel] = useState('')
      const [noteQuestions, setNoteQuestions] = useState(null)
      const [noteDiscussing, setNoteDiscussing] = useState('')
      const [noteReplies, setNoteReplies] = useState({})
      const [noteHistoryOpen, setNoteHistoryOpen] = useState(false)
      const [noteHistoryLoading, setNoteHistoryLoading] = useState(false)
      const [noteHistoryError, setNoteHistoryError] = useState('')
      const [noteHistoryVersions, setNoteHistoryVersions] = useState(null)
      const [noteHistoryPreview, setNoteHistoryPreview] = useState(null)
      const [noteHistoryBusy, setNoteHistoryBusy] = useState(false)
      const noteNarrow = useReaderNoteNarrow()

      // The page is the fullscreen element, so unmounting this panel no longer
      // exits the mode automatically. Track ownership to clean up on unmount.
      const fullscreenOwner = useRef(false)
      // True only when this mode collapsed a previously open host sidebar; the
      // exit path then restores it instead of guessing.
      const sidebarCollapsedByUs = useRef(false)
      const viewerRef = useRef(null)
      const zoomRef = useRef(ZOOM_DEFAULT)
      const zoomAnchorRef = useRef(null)
      const viewerWheelCleanup = useRef(null)
      const splitRef = useRef(null)
      const splitCleanupRef = useRef(null)
      const pageEls = useRef({})
      const chatScrollRef = useRef(null)
      const composerRef = useRef(null)
      const fileInputRef = useRef(null)
      const importFolderRef = useRef('')
      const uploadAbort = useRef(null)
      const chatAbort = useRef(null)
      const summaryAbort = useRef(null)
      const annotationTimer = useRef(null)
      const annotationsRef = useRef([])
      const selectionRef = useRef(null)
      const paperRef = useRef(null)
      const currentPageRef = useRef(1)
      const outlineRequested = useRef('')
      const lastPaperId = useRef('')
      const panRef = useRef(null)

      // Pan (hand) tool: the drag state lives in a ref so pointer moves only
      // touch scrollLeft/scrollTop and never re-render the React tree.
      const endPan = useCallback(() => {
        const state = panRef.current
        if (!state) return
        panRef.current = null
        const node = state.node || viewerRef.current
        node?.classList?.remove('panning')
        if (node && state.pointerId !== undefined) {
          try {
            if (node.hasPointerCapture?.(state.pointerId)) {
              node.releasePointerCapture(state.pointerId)
            }
          } catch {
            // the pointer may already be gone
          }
        }
        document.body.style.cursor = state.cursor
        document.body.style.userSelect = state.userSelect
      }, [])

      useEffect(() => {
        annotationsRef.current = annotations
      }, [annotations])
      useEffect(() => {
        selectionRef.current = selection
      }, [selection])
      useEffect(() => {
        paperRef.current = paper
      }, [paper])
      useEffect(() => {
        currentPageRef.current = currentPage
      }, [currentPage])

      useEffect(() => {
        zoomRef.current = zoom
      }, [zoom])

      // Apply the scroll compensation for wheel/button zoom after the new page
      // width is laid out, so the content under the pointer stays put.
      useLayoutEffect(() => {
        const anchor = zoomAnchorRef.current
        if (!anchor) return
        zoomAnchorRef.current = null
        const viewer = viewerRef.current
        if (!viewer || !anchor.el?.isConnected) return
        const rect = anchor.el.getBoundingClientRect()
        const nextX = rect.left + rect.width * anchor.fx
        const nextY = rect.top + rect.height * anchor.fy
        if (Number.isFinite(nextX)) viewer.scrollLeft += nextX - anchor.x
        if (Number.isFinite(nextY)) viewer.scrollTop += nextY - anchor.y
      }, [zoom])

      // Every paper starts at 100% so a zoomed previous paper does not leak in.
      useLayoutEffect(() => {
        zoomAnchorRef.current = null
        zoomRef.current = ZOOM_DEFAULT
        setZoom(ZOOM_DEFAULT)
      }, [paper?.id])

      useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 3200)
        return () => clearTimeout(timer)
      }, [toast])

      useEffect(() => {
        try {
          localStorage.setItem('dsh.literature.penWidth.v1', String(penWidth))
          localStorage.setItem('dsh.literature.eraserWidth.v1', String(eraserWidth))
          localStorage.setItem('dsh.literature.split.v1', String(splitPercent))
          localStorage.setItem('dsh.literature.textScale.v1', String(textScale))
        } catch {
          // storage can be unavailable
        }
      }, [penWidth, eraserWidth, splitPercent, textScale])

      function restoreSidebarAfterFullscreen() {
        if (!sidebarCollapsedByUs.current) return
        sidebarCollapsedByUs.current = false
        // A manual sidebar toggle while the mode is active is respected: only
        // re-open the sidebar when it is still in the state this mode implied.
        if (hostSidebarCollapsed() === true && layoutService && typeof layoutService.toggleSidebar === 'function') {
          layoutService.toggleSidebar()
        }
      }

      // The browser exits fullscreen on Esc without going through our button,
      // so mirror its state back into React and undo the host-side changes.
      useEffect(() => {
        const sync = () => {
          const active = fullscreenElement() === document.documentElement
          setFullscreen(active)
          if (!active) {
            fullscreenOwner.current = false
            restoreSidebarAfterFullscreen()
          }
        }
        document.addEventListener('fullscreenchange', sync)
        document.addEventListener('webkitfullscreenchange', sync)
        return () => {
          document.removeEventListener('fullscreenchange', sync)
          document.removeEventListener('webkitfullscreenchange', sync)
          // Unmounting while page-fullscreen is active must not strand the
          // application in a chrome-less page with no reader in it.
          if (fullscreenOwner.current) {
            fullscreenOwner.current = false
            exitFullscreen()
          }
          restoreSidebarAfterFullscreen()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // Switching away from the hand tool must end an in-flight drag, otherwise
      // the grabbing cursor and pointer capture would linger.
      useEffect(() => {
        if (mode !== 'pan') endPan()
      }, [mode, endPan])

      useEffect(() => {
        return () => {
          clearTimeout(annotationTimer.current)
          splitCleanupRef.current?.()
          viewerWheelCleanup.current?.()
          endPan()
          chatAbort.current?.abort()
          summaryAbort.current?.abort()
          uploadAbort.current?.abort()
        }
      }, [endPan])

      function upsertPaper(next) {
        setPapers((current) => {
          const rest = current.filter((item) => item.id !== next.id)
          return [next, ...rest]
        })
      }

      async function loadChat(id) {
        try {
          const result = await request(`/papers/${id}/chat`)
          setMessages(result.messages || [])
        } catch (loadError) {
          setError(safeError(loadError))
        }
      }

      async function choosePaper(id) {
        if (!id) return
        clearTimeout(annotationTimer.current)
        chatAbort.current?.abort()
        setError('')
        setSelection(null)
        setQuestion('')
        setSending(false)
        setStreaming(null)
        setSummary(null)
        setAnalysisModal(null)
        setSummaryModal(null)
        setExpandedMessage(null)
        setChapterValue('')
        setCurrentPage(1)
        try {
          const [paperResult, chatResult, annotationResult] = await Promise.all([
            request(`/papers/${id}`),
            request(`/papers/${id}/chat`),
            request(`/papers/${id}/annotations`),
          ])
          const nextPaper = paperResult.paper
          setPaper(nextPaper)
          setView('reader')
          paperRef.current = nextPaper
          upsertPaper(nextPaper)
          setMessages(chatResult.messages || [])
          setAnnotations(annotationResult.strokes || [])
          setRangeStart(1)
          setRangeEnd(Math.min(nextPaper.pageCount || 1, 5))
          localStorage.setItem(LAST_KEY, id)
          lastPaperId.current = id
          if (nextPaper.status === 'processing') startOutlineLater(nextPaper)
          requestAnimationFrame(() => {
            if (viewerRef.current) viewerRef.current.scrollTop = 0
          })
        } catch (loadError) {
          setError(safeError(loadError))
          setPaper(null)
        }
      }

      function startOutlineLater(nextPaper) {
        if (!nextPaper?.analysisReady || nextPaper.outline?.length > 0) return
        if (outlineRequested.current === nextPaper.id) return
        outlineRequested.current = nextPaper.id
        setOutlineLoading(true)
        request(`/papers/${nextPaper.id}/outline`, { method: 'POST' })
          .then((result) => {
            setPaper((current) =>
              current && current.id === nextPaper.id
                ? { ...current, outline: result.outline || [] }
                : current,
            )
            setPapers((current) =>
              current.map((item) =>
                item.id === nextPaper.id ? { ...item, outline: result.outline || [] } : item,
              ),
            )
          })
          .catch(() => {})
          .finally(() => setOutlineLoading(false))
      }

      async function refreshVault(refresh = true) {
        setVaultLoading(true)
        setVaultError('')
        try {
          const result = await request(`/vault/library${refresh ? '?refresh=1' : ''}`)
          setVaultLibrary(result)
          return result
        } catch (vaultLoadError) {
          setVaultError(safeError(vaultLoadError))
          return null
        } finally {
          setVaultLoading(false)
        }
      }

      useEffect(() => {
        if (view !== 'library') return undefined
        refreshVault(false)
        const timer = setInterval(() => refreshVault(true), 30_000)
        return () => clearInterval(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [view])

      function currentImportFolder() {
        if (paper?.vaultPath) return relDir(paper.vaultPath)
        return (
          importFolderRef.current ||
          pendingImportFolder ||
          vaultLibrary?.defaultFolder ||
          health?.importFolder ||
          ''
        )
      }

      function requestImport(folder) {
        const target = String(folder || '')
        importFolderRef.current = target
        setPendingImportFolder(target)
        fileInputRef.current?.click()
      }

      async function openVaultPdf(item) {
        if (!item?.rel) return
        setVaultBusy(item.rel)
        setVaultError('')
        try {
          const result = await request('/vault/open', {
            method: 'POST',
            body: { rel: item.rel },
          })
          await refreshVault(true)
          await choosePaper(result.paper.id)
        } catch (openError) {
          setVaultError(safeError(openError))
          throw openError
        } finally {
          setVaultBusy('')
        }
      }

      async function openVaultNote(rel) {
        try {
          await request('/vault/open-note', { method: 'POST', body: { rel } })
        } catch (openError) {
          setVaultError(safeError(openError))
        }
      }

      async function saveVaultItem(item, form) {
        setVaultBusy(item.rel)
        try {
          const result = await request('/vault/item', {
            method: 'PATCH',
            body: {
              rel: item.rel,
              title: form.title,
              fileName: form.fileName,
              renameNote: form.renameNote !== false,
              tags: form.tags,
            },
          })
          await refreshVault(true)
          if (paper && (paper.id === result.paper?.id || paper.vaultPath === item.rel)) {
            if (result.paper) {
              setPaper(result.paper)
              setPapers((current) =>
                current.map((entry) => (entry.id === result.paper.id ? result.paper : entry)),
              )
            } else {
              const fresh = await request(`/papers/${paper.id}`)
              setPaper(fresh.paper)
              setPapers((current) =>
                current.map((entry) => (entry.id === fresh.paper.id ? fresh.paper : entry)),
              )
            }
          }
          showToast(t('saved'))
          return result
        } finally {
          setVaultBusy('')
        }
      }

      async function createLibraryFolder(parent, name) {
        const result = await request('/vault/folder', {
          method: 'POST',
          body: { parent, name },
        })
        await refreshVault(true)
        return result.rel
      }

      function clearReaderPaper() {
        setPaper(null)
        setMessages([])
        setAnnotations([])
        setSelection(null)
        setSummary(null)
        setStreaming(null)
        setCurrentPage(1)
        currentPageRef.current = 1
        localStorage.removeItem(LAST_KEY)
        lastPaperId.current = ''
      }

      async function refreshPaperList() {
        try {
          const result = await request('/library')
          setPapers(result.papers || [])
        } catch {
          // The vault library is authoritative; a stale recent list is harmless.
        }
      }

      async function moveLibraryEntry(rel, kind, folder) {
        setVaultBusy(rel)
        try {
          const result = await request('/vault/item/move', {
            method: 'POST',
            body: { rel, kind, folder },
          })
          if (result.changed) {
            setPaper((current) =>
              current?.vaultPath === result.oldRel ? { ...current, vaultPath: result.rel } : current,
            )
            setPapers((current) =>
              current.map((entry) =>
                entry.vaultPath === result.oldRel ? { ...entry, vaultPath: result.rel } : entry,
              ),
            )
          }
          await refreshVault(true)
          showToast(
            t('movedOk').replace('{folder}', folder ? folder : t('vaultRoot')),
          )
          return result
        } catch (moveError) {
          throw moveError
        } finally {
          setVaultBusy('')
        }
      }

      async function renameLibraryFolder(rel, name) {
        setVaultBusy(rel)
        try {
          const result = await request('/vault/folder/rename', {
            method: 'POST',
            body: { rel, name },
          })
          if (result.changed) {
            const rebase = (value) => {
              if (!value) return value
              if (value === result.oldRel || value.startsWith(`${result.oldRel}/`)) {
                return `${result.rel}${value.slice(result.oldRel.length)}`
              }
              return value
            }
            setPaper((current) =>
              current?.vaultPath ? { ...current, vaultPath: rebase(current.vaultPath) } : current,
            )
            setPapers((current) =>
              current.map((entry) =>
                entry.vaultPath ? { ...entry, vaultPath: rebase(entry.vaultPath) } : entry,
              ),
            )
            setPendingImportFolder((current) => rebase(current))
            importFolderRef.current = rebase(importFolderRef.current)
          }
          await refreshVault(true)
          // Be accurate: a sanitised name did change, an identical one did not.
          if (!result.changed) {
            showToast(t('folderRenameUnchanged'))
          } else if (result.sanitized) {
            showToast(
              t('folderRenamedSanitized').split('{name}').join(String(result.name || name)),
            )
          } else {
            showToast(t('folderRenamedOk'))
          }
          return result
        } catch (renameError) {
          throw renameError
        } finally {
          setVaultBusy('')
        }
      }

      async function deleteLibraryEntry(target, options = {}) {
        const rel = target.kind === 'folder' ? target.rel : target.item?.rel
        if (!rel) return null
        setVaultBusy(rel)
        try {
          const result = await request('/vault/delete', {
            method: 'POST',
            body: {
              kind: target.kind,
              rel,
              confirm: true,
              deleteNotes: Boolean(options.deleteNotes),
            },
          })
          const removed = result.removedPaperIds || []
          const vaultPath = paper?.vaultPath || ''
          const inDeletedFolder =
            target.kind === 'folder' &&
            vaultPath &&
            (vaultPath === rel || vaultPath.startsWith(`${rel}/`))
          const isDeletedPdf = target.kind === 'pdf' && vaultPath === rel
          if (paper && (removed.includes(paper.id) || inDeletedFolder || isDeletedPdf)) {
            clearReaderPaper()
          }
          if (removed.length) {
            setPapers((current) => current.filter((entry) => !removed.includes(entry.id)))
          }
          await refreshVault(true)
          await refreshPaperList()
          showToast(t('deletedOk'))
          if (result.warnings?.length) setVaultError(result.warnings.join('；'))
          return result
        } catch (deleteError) {
          throw deleteError
        } finally {
          setVaultBusy('')
        }
      }

      async function deleteCachedLibraryItem(item) {
        if (!item?.paperId) return null
        setVaultBusy(item.paperId)
        try {
          await request(`/papers/${item.paperId}?confirm=true`, { method: 'DELETE' })
          if (paper?.id === item.paperId) clearReaderPaper()
          setPapers((current) => current.filter((entry) => entry.id !== item.paperId))
          await refreshVault(true)
          showToast(t('deletedOk'))
          return true
        } catch (deleteError) {
          throw deleteError
        } finally {
          setVaultBusy('')
        }
      }

      async function openLegacyPaper(paperId) {
        try {
          await choosePaper(paperId)
        } catch (openError) {
          setVaultError(safeError(openError))
        }
      }

      // Keep whichever effort label the host resolved, so the pill and the
      // picker can explain what a call will actually use.
      function effortLabelOf(healthValue) {
        const active = healthValue?.activeEffort || ''
        if (!active) return ''
        const list = Array.isArray(healthValue?.effortLabels) ? healthValue.effortLabels : []
        const found = list.find((item) => item.id === active)
        return found?.name || active
      }

      async function openModelPicker() {
        setModelPickerOpen(true)
        if (modelGroups.length > 0) return
        setModelLoading(true)
        setModelError('')
        try {
          const result = await request('/models')
          setModelGroups(result.groups || [])
        } catch (loadError) {
          // A page refreshed before the host module restarts sees a 404 here.
          // Say so instead of showing an empty model list.
          setModelError(
            loadError.status === 404
              ? t('modelNeedsRestart')
              : safeError(loadError),
          )
        } finally {
          setModelLoading(false)
        }
      }

      async function applyModelChoice(next) {
        if (modelBusy) return
        setModelBusy(true)
        setModelError('')
        try {
          const result = await request('/models', { method: 'PUT', body: next })
          setHealth((current) => ({
            ...(current || {}),
            model: result.selection ? `${result.selection.provider}/${result.selection.model}` : current?.model,
            provider: result.selection?.provider || current?.provider,
            modelId: result.selection?.model || current?.modelId,
            supportImages: result.supportImages,
            reasoningEfforts: result.reasoningEfforts || [],
            effortLabels: result.effortLabels || [],
            defaultEffort: result.defaultEffort || null,
            activeEffort: result.activeEffort || '',
            preference: result.preference,
          }))
          const label = result.selection ? result.selection.model : next.model
          showToast(t('modelSaved').replace('{model}', label))
        } catch (saveError) {
          setModelError(safeError(saveError))
          showToast(
            t('modelSaveFailed').replace('{message}', safeError(saveError)),
            'error',
          )
        } finally {
          setModelBusy(false)
        }
      }

      async function chooseEffort(effort) {
        const preference = health?.preference || {}
        await applyModelChoice({
          provider: preference.provider || health?.provider || '',
          model: preference.model || health?.modelId || '',
          reasoningEffort: effort || '',
        })
      }

      function modelNameOf(healthValue) {
        if (!healthValue) return 'AI'
        const group = modelGroups.find((item) => item.provider === healthValue.provider)
        const found = (group ? group.models : []).find((item) => item.id === healthValue.modelId)
        return found?.name || healthValue.modelId || healthValue.model || 'AI'
      }

      useEffect(() => {
        let cancelled = false
        async function boot() {
          try {
            const [libraryResult, healthResult] = await Promise.all([
              request('/library'),
              request('/health'),
            ])
            if (cancelled) return
            setPapers(libraryResult.papers || [])
            setHealth(healthResult)
            request('/vault/library')
              .then((vaultResult) => {
                if (!cancelled) setVaultLibrary(vaultResult)
              })
              .catch(() => {})
            const saved = localStorage.getItem(LAST_KEY)
            const exists = (libraryResult.papers || []).some((item) => item.id === saved)
            if (saved && exists) {
              await choosePaper(saved)
            }
          } catch (bootError) {
            if (!cancelled) setError(safeError(bootError))
          } finally {
            if (!cancelled) setBooting(false)
          }
        }
        boot()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useEffect(() => {
        if (!paper || paper.status !== 'processing') return undefined
        let cancelled = false
        const timer = setInterval(async () => {
          try {
            const result = await request(`/papers/${paper.id}`)
            if (cancelled) return
            setPaper(result.paper)
            setPapers((current) =>
              current.map((item) => (item.id === result.paper.id ? result.paper : item)),
            )
          } catch {
            // transient polling failures are ignored; the next tick retries
          }
        }, 1800)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [paper?.id, paper?.status])

      useEffect(() => {
        if (!paper) return
        if (paper.status === 'ready') {
          if (lastPaperId.current !== paper.id) {
            lastPaperId.current = paper.id
          }
          loadChat(paper.id)
          startOutlineLater(paper)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [paper?.id, paper?.status, paper?.analysisReady])

      useEffect(() => {
        if (outlineLoading) setOutlineLoading(false)
        if (!paper) return
        const outline = paper.outline || []
        if (outline.length > 0 && (!chapterValue || chapterValue === '__custom')) {
          setChapterValue('0')
          setRangeStart(outline[0].start)
          setRangeEnd(outline[0].end)
        } else if (outline.length === 0 && !chapterValue) {
          setChapterValue('__custom')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [paper?.id, paper?.outline?.length])

      useEffect(() => {
        if (!importState?.active || !paper || importState.paperId !== paper.id) return undefined
        if (paper.status === 'ready' || paper.status === 'error') {
          const timer = setTimeout(() => setImportState(null), 900)
          return () => clearTimeout(timer)
        }
        return undefined
      }, [paper?.status, importState?.active, importState?.paperId])

      useEffect(() => {
        const element = chatScrollRef.current
        if (!element) return
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight
        if (distance < 220 || streaming) {
          element.scrollTop = element.scrollHeight
        }
      }, [messages, streaming, summary])

      const canChat = Boolean(paper) && (Boolean(paper.analysisReady) || Number(paper.chars) > 0)
      const isProcessing = paper?.status === 'processing'
      const summaryRunning = Boolean(summary?.running)
      const summaryResult = summary?.result

      function showToast(message, kind = 'ok') {
        setToast({ message, kind, id: Date.now() })
      }

      async function toggleFullscreen() {
        if (fullscreenElement() === document.documentElement) {
          await exitFullscreen()
          return
        }
        fullscreenOwner.current = true
        if (!(await enterFullscreen(document.documentElement))) {
          fullscreenOwner.current = false
          showToast(t('fullscreenFailed'), 'error')
          return
        }
        // Collapse the host sidebar so the reader gets the full width. The page
        // itself stays mounted, which is what keeps the wallpaper and the
        // weather overlay (shell.overlay) alive in this mode.
        if (
          hostSidebarCollapsed() === false &&
          layoutService &&
          typeof layoutService.toggleSidebar === 'function'
        ) {
          sidebarCollapsedByUs.current = true
          layoutService.toggleSidebar()
        }
      }

      function scheduleAnnotationSave(next) {
        clearTimeout(annotationTimer.current)
        const id = paperRef.current?.id
        if (!id) return
        annotationTimer.current = setTimeout(() => {
          request(`/papers/${id}/annotations`, { method: 'PUT', body: { strokes: next } }).catch(
            (saveError) => setError(safeError(saveError)),
          )
        }, 550)
      }

      const addStroke = useCallback((stroke) => {
        setAnnotations((current) => {
          const next = [...current, stroke]
          scheduleAnnotationSave(next)
          return next
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const eraseAt = useCallback((page, point, dims, width) => {
        setAnnotations((current) => {
          const pixelWidth = Math.max(1, Number(dims?.width) || 1)
          const pixelHeight = Math.max(1, Number(dims?.height) || 1)
          const limit = Math.max(3, Number(width) || 18) / 2
          let removeIndex = -1
          for (let index = current.length - 1; index >= 0; index -= 1) {
            const stroke = current[index]
            if (stroke.page !== page) continue
            const strokeLimit = limit + Math.max(1, Number(stroke.width) || 1) / 2
            for (const strokePoint of stroke.points) {
              const dx = (strokePoint[0] - point.x) * pixelWidth
              const dy = (strokePoint[1] - point.y) * pixelHeight
              if (Math.hypot(dx, dy) <= strokeLimit) {
                removeIndex = index
                break
              }
            }
            if (removeIndex >= 0) break
          }
          if (removeIndex < 0) return current
          const next = current.slice(0, removeIndex).concat(current.slice(removeIndex + 1))
          scheduleAnnotationSave(next)
          return next
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const undo = useCallback(() => {
        setAnnotations((current) => {
          if (!current.length) return current
          const next = current.slice(0, -1)
          scheduleAnnotationSave(next)
          return next
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const clearSelection = useCallback(() => {
        setSelection(null)
        setShowBubble(false)
      }, [])

      const useSelection = useCallback(() => {
        setShowBubble(false)
        setTimeout(() => composerRef.current?.focus(), 20)
      }, [])

      const selectRegion = useCallback((next) => {
        setSelection(next)
        setShowBubble(true)
      }, [])

      const registerPage = useCallback((pageNumber, node) => {
        if (node) pageEls.current[pageNumber] = node
        else delete pageEls.current[pageNumber]
      }, [])

      const clampZoomValue = useCallback(
        (value) =>
          Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(value) ? value : ZOOM_DEFAULT)),
        [],
      )

      // Remember which page/point sits under the pointer, so the content under
      // the cursor can stay fixed while the page column grows or shrinks.
      const captureZoomAnchor = useCallback((clientX, clientY) => {
        const viewer = viewerRef.current
        if (!viewer) return null
        let target = null
        const hit = document.elementFromPoint(clientX, clientY)
        const hitPaper = hit?.closest?.('.lr-page-paper')
        if (hitPaper && viewer.contains(hitPaper)) {
          target = hitPaper
        } else {
          let bestDistance = Number.POSITIVE_INFINITY
          for (const pageEl of Object.values(pageEls.current)) {
            const candidate = pageEl?.querySelector?.('.lr-page-paper')
            if (!candidate) continue
            const rect = candidate.getBoundingClientRect()
            const dx = Math.max(rect.left - clientX, 0, clientX - rect.right)
            const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom)
            const distance = Math.hypot(dx, dy)
            if (distance < bestDistance) {
              bestDistance = distance
              target = candidate
            }
          }
        }
        if (!target) target = viewer.querySelector('.lr-pages-inner')
        if (!target) return null
        const rect = target.getBoundingClientRect()
        return {
          el: target,
          x: clientX,
          y: clientY,
          fx: (clientX - rect.left) / Math.max(1, rect.width),
          fy: (clientY - rect.top) / Math.max(1, rect.height),
        }
      }, [])

      const centerZoomAnchor = useCallback(() => {
        const viewer = viewerRef.current
        if (!viewer) return null
        const rect = viewer.getBoundingClientRect()
        return captureZoomAnchor(rect.left + rect.width / 2, rect.top + rect.height / 2)
      }, [captureZoomAnchor])

      const applyZoom = useCallback(
        (value, anchor) => {
          const next = Math.round(clampZoomValue(value) * 10) / 10
          if (Math.abs(next - zoomRef.current) < 0.05) return
          zoomAnchorRef.current = anchor || centerZoomAnchor()
          zoomRef.current = next
          setZoom(next)
        },
        [centerZoomAnchor, clampZoomValue],
      )

      const zoomBy = useCallback(
        (delta) => applyZoom(Math.round(zoomRef.current) + delta, centerZoomAnchor()),
        [applyZoom, centerZoomAnchor],
      )

      const resetZoom = useCallback(
        () => applyZoom(ZOOM_DEFAULT, centerZoomAnchor()),
        [applyZoom, centerZoomAnchor],
      )

      // React attaches onWheel as a passive listener, so the wheel handler is
      // bound natively to be able to prevent the browser's whole-page zoom.
      const attachViewer = useCallback(
        (node) => {
          viewerRef.current = node
          viewerWheelCleanup.current?.()
          viewerWheelCleanup.current = null
          if (!node) {
            endPan()
            return
          }
          const onWheel = (event) => {
            if (!(event.ctrlKey || event.metaKey)) return
            const viewer = viewerRef.current
            if (!viewer) return
            event.preventDefault()
            const unit =
              event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewer.clientHeight || 1 : 1
            const delta = event.deltaY * unit
            if (!delta) return
            const factor = Math.exp(-delta * 0.0015)
            applyZoom(
              zoomRef.current * factor,
              captureZoomAnchor(event.clientX, event.clientY),
            )
          }
          node.addEventListener('wheel', onWheel, { passive: false })
          viewerWheelCleanup.current = () => node.removeEventListener('wheel', onWheel)
        },
        [applyZoom, captureZoomAnchor, endPan],
      )

      // Hand tool: press and hold the left button anywhere in the reading area
      // to drag the document. Only the scroll offsets change per move.
      function onViewerPointerDown(event) {
        if (mode !== 'pan' || event.button !== 0) return
        if (event.target?.closest?.('.lr-bubble')) return
        const viewer = viewerRef.current || event.currentTarget
        if (!viewer || panRef.current) return
        event.preventDefault()
        panRef.current = {
          node: viewer,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: viewer.scrollLeft,
          startTop: viewer.scrollTop,
          cursor: document.body.style.cursor,
          userSelect: document.body.style.userSelect,
        }
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        viewer.classList.add('panning')
        try {
          viewer.setPointerCapture?.(event.pointerId)
        } catch {
          // capturing is best-effort; movement still tracks inside the viewer
        }
      }

      function onViewerPointerMove(event) {
        const state = panRef.current
        if (!state || event.pointerId !== state.pointerId) return
        state.node.scrollLeft = state.startLeft - (event.clientX - state.startX)
        state.node.scrollTop = state.startTop - (event.clientY - state.startY)
      }

      function onViewerPointerRelease(event) {
        const state = panRef.current
        if (!state) return
        if (event && event.pointerId !== undefined && event.pointerId !== state.pointerId) return
        endPan()
      }

      function beginSplit(event) {
        if (window.innerWidth <= 860) return
        const container = splitRef.current
        if (!container) return
        event.preventDefault()
        window.getSelection?.()?.removeAllRanges()
        splitCleanupRef.current?.()
        const rect = container.getBoundingClientRect()
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        setResizing(true)
        const move = (moveEvent) => {
          const minChat = 220
          const maxViewer = Math.min(82, Math.max(45, 100 - (minChat / Math.max(1, rect.width)) * 100))
          const next = ((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) * 100
          setSplitPercent(Math.max(45, Math.min(maxViewer, next)))
        }
        const end = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', end)
          window.removeEventListener('pointercancel', end)
          splitCleanupRef.current = null
          document.body.style.cursor = previousCursor
          document.body.style.userSelect = previousUserSelect
          setResizing(false)
        }
        splitCleanupRef.current = end
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', end)
        window.addEventListener('pointercancel', end)
      }

      function scrollToPage(pageNumber, behavior = 'smooth') {
        const viewer = viewerRef.current
        const element = pageEls.current[pageNumber]
        if (!viewer || !element) return
        const viewerRect = viewer.getBoundingClientRect()
        const elementRect = element.getBoundingClientRect()
        const top = elementRect.top - viewerRect.top + viewer.scrollTop - 16
        viewer.scrollTo({ top: Math.max(0, top), behavior })
        setCurrentPage(pageNumber)
      }

      function onViewerScroll() {
        const viewer = viewerRef.current
        if (!viewer) return
        const viewerTop = viewer.getBoundingClientRect().top
        let best = 1
        let bestDistance = Infinity
        for (const [pageNumber, element] of Object.entries(pageEls.current)) {
          if (!element) continue
          const distance = Math.abs(element.getBoundingClientRect().top - viewerTop - 12)
          if (distance < bestDistance) {
            bestDistance = distance
            best = Number(pageNumber)
          }
        }
        if (best !== currentPageRef.current) {
          currentPageRef.current = best
          setCurrentPage(best)
        }
      }

      function quickPrompt(kind, hasSelection) {
        const page = selection?.page || currentPageRef.current
        if (kind === 'translate') {
          return hasSelection
            ? '翻译我框选的内容'
            : `翻译第 ${page} 页最重要的段落`
        }
        if (kind === 'term') {
          return hasSelection
            ? '解释我框选内容中出现的关键术语'
            : `解释第 ${page} 页出现的核心术语`
        }
        if (kind === 'explain') {
          return hasSelection
            ? '解释我框选的内容'
            : `解释第 ${page} 页的核心内容`
        }
        if (kind === 'points') {
          return hasSelection
            ? '提炼我框选内容的要点'
            : `提炼第 ${page} 页的要点`
        }
        if (kind === 'critique') {
          return hasSelection
            ? '从审稿人的角度质疑我框选的内容'
            : `从审稿人的角度质疑第 ${page} 页的论述`
        }
        return ''
      }

      function startAsk(kind, overrideSelection) {
        if (!paper || sending || summaryRunning) return
        const activeSelection = overrideSelection || selectionRef.current
        if ((kind === 'translate' || kind === 'term') && !activeSelection) {
          setError(t('noSelection'))
          return
        }
        if (!canChat) {
          setError(t('chatDisabled'))
          return
        }
        const prompt = quickPrompt(kind, Boolean(activeSelection))
        setShowBubble(false)
        sendQuestion(prompt, activeSelection, kind)
      }

      const quickSelection = useCallback((kind) => {
        startAsk(kind, selectionRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [paper?.id, sending, summaryRunning, canChat])

      async function sendQuestion(text, overrideSelection, action = 'ask') {
        const value = String(text || '').trim()
        if (!paper || sending || summaryRunning) return
        if (!value) return
        if (!canChat) {
          setError(t('chatDisabled'))
          return
        }
        const activeSelection = overrideSelection || selectionRef.current
        setShowBubble(false)
        const tempId = `local-${Date.now()}`
        const localUser = {
          id: tempId,
          role: 'user',
          content: value,
          createdAt: new Date().toISOString(),
          page: activeSelection?.page || currentPageRef.current,
          action,
          selection: activeSelection
            ? {
                page: activeSelection.page,
                imageUrl: activeSelection.imageData,
              }
            : undefined,
        }
        setMessages((current) => [...current, localUser])
        setStreaming({ role: 'assistant', content: '' })
        setQuestion('')
        setSending(true)
        setError('')
        const controller = new AbortController()
        chatAbort.current = controller
        let accumulated = ''
        try {
          await streamSse(
            `/papers/${paper.id}/ask`,
            {
              question: value,
              action,
              page: activeSelection?.page || currentPageRef.current,
              selection: activeSelection
                ? {
                    page: activeSelection.page,
                    imageData: activeSelection.imageData,
                    quote: activeSelection.quote || '',
                  }
                : undefined,
            },
            (event) => {
              if (event.type === 'user') {
                setMessages((current) =>
                  current.map((message) => (message.id === tempId ? event.message : message)),
                )
              } else if (event.type === 'status') {
                if (!accumulated) {
                  setStreaming({
                    role: 'assistant',
                    content: event.label ? `*${event.label}*` : '',
                  })
                }
              } else if (event.type === 'delta') {
                accumulated += event.text || ''
                setStreaming({ role: 'assistant', content: accumulated })
              } else if (event.type === 'done') {
                setMessages((current) => [
                  ...current.filter((message) => message.id !== tempId && message.id !== 'streaming'),
                  event.message,
                ])
                setStreaming(null)
              } else if (event.type === 'vocab') {
                if (event.status === 'duplicate') {
                  setWordNotice({
                    term: event.term || '',
                    translation: event.translation || '',
                    number: event.number || 0,
                    note: event.noteName || '英文单词',
                    section: event.section || '',
                  })
                } else if (event.status === 'saved') {
                  showToast(
                    t('wordSaved')
                      .replace('{note}', () => event.noteName || '英文单词')
                      .replace('{number}', () => String(event.number || '')),
                  )
                } else if (event.status === 'error') {
                  showToast(
                    t('wordRecordError').replace('{message}', () => event.message || ''),
                    'warn',
                  )
                }
              }
            },
            controller.signal,
          )
        } catch (askError) {
          if (askError.name !== 'AbortError' && !String(askError.message || '').includes('aborted')) {
            setError(safeError(askError) || t('loadFailed'))
            if (accumulated.trim()) {
              setMessages((current) => [
                ...current,
                {
                  id: `partial-${Date.now()}`,
                  role: 'assistant',
                  content: `${accumulated}\n\n> ⚠️ ${safeError(askError)}`,
                  error: true,
                  citations: [],
                },
              ])
            }
          }
        } finally {
          setStreaming(null)
          setSending(false)
          chatAbort.current = null
          if (paperRef.current?.id === paper.id) {
            request(`/papers/${paper.id}`)
              .then((result) => {
                setPaper(result.paper)
                setPapers((current) =>
                  current.map((item) => (item.id === result.paper.id ? result.paper : item)),
                )
              })
              .catch(() => {})
          }
        }
      }

      async function runExtract(chapterOverride) {
        if (!paper || sending || summaryRunning) return
        const chapter = chapterOverride || selectedChapter
        if (!chapter) return
        const start = Math.max(1, Math.min(paper.pageCount || 1, Number(chapter.start) || 1))
        const end = Math.max(start, Math.min(paper.pageCount || 1, Number(chapter.end) || start))
        const title = chapter.title || `${start}-${end}`
        const tempId = `extract-${Date.now()}`
        const localUser = {
          id: tempId,
          role: 'user',
          content: `提炼“${title}”的要点（第 ${start}-${end} 页）`,
          createdAt: new Date().toISOString(),
          page: start,
          kind: 'extract-request',
          chapter: { title, start, end },
        }
        setMessages((current) => [...current, localUser])
        setStreaming({ role: 'assistant', content: '' })
        setSending(true)
        setError('')
        const controller = new AbortController()
        chatAbort.current = controller
        let accumulated = ''
        try {
          await streamSse(
            `/papers/${paper.id}/extract`,
            { start, end, title },
            (event) => {
              if (event.type === 'user') {
                setMessages((current) =>
                  current.map((message) => (message.id === tempId ? event.message : message)),
                )
              } else if (event.type === 'delta') {
                accumulated += event.text || ''
                setStreaming({ role: 'assistant', content: accumulated })
              } else if (event.type === 'done') {
                setMessages((current) => [
                  ...current.filter((message) => message.id !== tempId && message.id !== 'streaming'),
                  event.message,
                ])
                setStreaming(null)
              }
            },
            controller.signal,
          )
        } catch (extractError) {
          if (extractError.name !== 'AbortError' && !String(extractError.message || '').includes('aborted')) {
            setError(safeError(extractError) || t('loadFailed'))
          }
        } finally {
          setStreaming(null)
          setSending(false)
          chatAbort.current = null
        }
      }

      /**
       * Ask the host which vocabulary terms are genuinely this paper's
       * technical terms. Returns null on any problem — the caller then runs the
       * old flow untouched, because a glossary question must never block a
       * summary the reader asked for.
       */
      async function prepareGlossary() {
        // Bound the wait: a hung prepare must not leave the button spinning
        // forever. Timing out simply falls back to the single-phase flow.
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 20000)
        try {
          const result = await request(`/papers/${paper.id}/summary/prepare`, {
            method: 'POST',
            body: {},
            signal: controller.signal,
          })
          if (!result || !result.ok) return null
          const include = Array.isArray(result.include)
            ? result.include.filter((item) => item && item.term)
            : []
          const questions = Array.isArray(result.questions)
            ? result.questions.filter((item) => item && item.term)
            : []
          return { include, questions, excluded: Number(result.excluded) || 0, total: Number(result.total) || 0 }
        } catch {
          // Silent by design: 404 from an older host, a timeout, or a model
          // hiccup all fall back to the pre-existing single-phase behaviour.
          return null
        } finally {
          clearTimeout(timer)
        }
      }

      /**
       * `glossaryOverride` is a FULL REPLACEMENT for the glossary, not a delta.
       * The host stops reading the vocabulary note entirely when it is present,
       * so it must always carry `include` *plus* whatever the reader ticked.
       * Sending only the ticked terms would silently drop every term the model
       * was already sure about — the summary still generates, just with fewer
       * glossary entries, which is easy to miss.
       */
      function glossaryOverrideFor(include, picked) {
        const seen = new Set()
        const out = []
        // Picked terms go first: when the host's 50-entry cap forces a trim,
        // what the reader deliberately ticked must survive ahead of the model's
        // own picks.
        for (const item of [...(picked || []), ...(include || [])]) {
          const term = String(item?.term || '').trim()
          if (!term) continue
          const key = term.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ term, translation: String(item?.translation || '') })
        }
        return out.slice(0, 50)
      }

      async function runSummary() {
        if (!paper || sending || summaryRunning || glossaryAsk) return
        if (Number(paper.chars) <= 0 && !paper.analysisReady) {
          setError(t('summaryNeedsText'))
          return
        }
        if (paper.hasSummary) {
          const ok = window.confirm(t('summaryExists'))
          if (!ok) return
        }
        // Phase 1: classify the vocabulary note. This is a plain request, not a
        // stream, so a failure here is recoverable and never leaves a dangling
        // SSE behind.
        setSummary({ running: true, label: t('summaryPreparing') })
        setError('')
        const prepared = await prepareGlossary()
        if (prepared && prepared.questions.length > 0) {
          setSummary(null)
          setGlossaryAsk(prepared)
          return
        }
        await generateSummary(glossaryOverrideFor(prepared?.include, []))
      }

      async function generateSummary(glossaryOverride) {
        if (!paper) return
        const payload = Array.isArray(glossaryOverride) && glossaryOverride.length > 0
          ? { glossaryOverride }
          : {}

        setSummary({ running: true, label: t('summaryRunning') })
        setError('')
        const controller = new AbortController()
        summaryAbort.current = controller
        let failed = false
        try {
          await streamSse(
            `/papers/${paper.id}/summary`,
            payload,
            (event) => {
              if (event.type === 'status') {
                setSummary({ running: true, label: event.label || t('summaryRunning') })
              } else if (event.type === 'done') {
                setSummary({ running: false, result: event, label: t('summaryDone') })
                setPaper((current) =>
                  current
                    ? {
                        ...current,
                        hasSummary: Boolean(event.hasNote),
                        tags: Array.from(new Set([...(current.tags || []), ...(event.tags || [])])).slice(0, 18),
                      }
                    : current,
                )
                setPapers((current) =>
                  current.map((item) =>
                    item.id === paper.id
                      ? {
                          ...item,
                          hasSummary: Boolean(event.hasNote),
                          tags: Array.from(new Set([...(item.tags || []), ...(event.tags || [])])).slice(0, 18),
                        }
                      : item,
                  ),
                )
                if (event.hasNote) {
                  showToast(
                    event.openError
                      ? `${t('summaryWritten')} · ${event.openError}`
                      : t('summaryWritten'),
                    event.openError ? 'warn' : 'ok',
                  )
                } else {
                  setError(event.openError || '总结已生成，但写入 Obsidian 失败')
                }
              }
            },
            controller.signal,
          )
        } catch (summaryError) {
          failed = true
          if (summaryError.name !== 'AbortError') {
            setError(safeError(summaryError) || t('summaryFailed'))
          }
          setSummary(null)
        } finally {
          summaryAbort.current = null
          if (!failed) {
            setSummary((current) => (current?.result ? current : current ? { ...current, running: false } : null))
          }
          request(`/papers/${paper.id}`)
            .then((result) => {
              setPaper(result.paper)
              setPapers((current) =>
                current.map((item) => (item.id === result.paper.id ? result.paper : item)),
              )
            })
            .catch(() => {})
        }
      }

      async function retryProcessing() {
        if (!paper || retrying) return
        setRetrying(true)
        setError('')
        try {
          const result = await request(`/papers/${paper.id}/retry`, { method: 'POST' })
          setPaper(result.paper)
          setPapers((current) =>
            current.map((item) => (item.id === result.paper.id ? result.paper : item)),
          )
          showToast(t('processing'), 'ok')
        } catch (retryError) {
          setError(safeError(retryError))
        } finally {
          setRetrying(false)
        }
      }

      async function openAnalysis() {
        if (!paper) return
        setAnalysisModal({ loading: true, title: t('analysisTitle'), markdown: '' })
        try {
          const result = await request(`/papers/${paper.id}/analysis`)
          setAnalysisModal({ loading: false, title: t('analysisTitle'), markdown: result.markdown || '' })
        } catch (analysisError) {
          setAnalysisModal(null)
          setError(safeError(analysisError))
        }
      }

      async function openSummaryPreview() {
        if (!paper) return
        setSummaryModal({ loading: true, title: t('summaryPreview'), markdown: '' })
        try {
          const result = await request(`/papers/${paper.id}/summary`)
          setSummaryModal({ loading: false, title: t('summaryPreview'), markdown: result.markdown || '' })
        } catch (previewError) {
          setSummaryModal(null)
          setError(safeError(previewError))
        }
      }

      async function openNote() {
        if (!paper) return
        try {
          await request(`/papers/${paper.id}/open-note`, { method: 'POST' })
          showToast(t('summaryWritten'))
        } catch (noteError) {
          setError(safeError(noteError))
        }
      }

      // Enter the full-screen summary view. No request here: the view loads
      // GET /summary itself so it can also be refreshed in place.
      function openStudyNote() {
        if (!paper) return
        if (view === 'note') return
        setError('')
        setView('note')
      }

      // ── Reader note handlers (docs/reader-note-spec.md §7) ────────────────
      // Every call degrades quietly while the host routes are absent: a 404 or a
      // network error is treated as "no note yet" so the reader keeps working.

      function noteResult(payload) {
        const value = payload && typeof payload === 'object' ? payload : {}
        return {
          exists: Boolean(value.exists),
          path: value.path || '',
          relative: value.relative || '',
          markdown: typeof value.markdown === 'string' ? value.markdown : '',
          hash: value.hash || '',
          updatedAt: value.updatedAt || '',
          entryCount: Number(value.entryCount) || 0,
          questions: Array.isArray(value.questions) ? value.questions : [],
          lostPath: value.lostPath || '',
        }
      }

      async function refreshReaderNote() {
        if (!paper) {
          setReaderNote(null)
          return null
        }
        try {
          const payload = await request(`/papers/${paper.id}/reader-note`)
          const result = noteResult(payload)
          setReaderNote(result)
          return result
        } catch (noteError) {
          // Spec §7.7 distinguishes three outcomes: only a 404 means "no note
          // yet". A transport error (no HTTP status) is "host unreachable" and
          // is retryable; anything else (500, 401, a write fault) must surface
          // its real cause. Neither may be treated as an empty note, because
          // 「记录笔记」 would then fall through to POST /reader-note and rebuild
          // a note that already exists.
          const status = noteError?.status
          const noNote = status === 404
          const failed = !noNote
          const missing = {
            ...noteResult(null),
            exists: noNote ? false : Boolean(paper.hasReaderNote),
            fetchFailed: failed,
            fetchError: !failed
              ? ''
              : status
                ? safeError(noteError) || t('readerNoteLoadFailed')
                : t('readerNoteUnreachable'),
          }
          if (paper.readerNoteRelative) missing.relative = paper.readerNoteRelative
          setReaderNote(missing)
          if (failed) setError(missing.fetchError)
          return missing
        }
      }

      function noteDraftState() {
        return readerNote ? noteResult(readerNote) : noteResult(null)
      }

      // 「建立笔记」/「记录笔记」. The lost-file branch is spec §14.6: the file was
      // deleted outside the plugin, so re-creating it deserves one confirmation.
      // `current` is passed in when the caller has just fetched the note: React
      // state would still be stale on the same tick.
      async function createReaderNote(current) {
        if (!paper || noteCreating) return null
        const snapshot = current || noteDraftState()
        if (snapshot.lostPath && typeof window !== 'undefined' && typeof window.confirm === 'function') {
          const message = readerNoteText('readerNoteLostConfirm', { path: snapshot.lostPath })
          if (!window.confirm(message)) return null
        }
        setNoteCreating(true)
        try {
          const payload = await request(`/papers/${paper.id}/reader-note`, { method: 'POST' })
          const result = noteResult({ ...payload, exists: true })
          setReaderNote(result)
          showToast(t('readerNoteCreated'))
          setPaper((previous) => (previous ? { ...previous, hasReaderNote: true, readerNoteRelative: result.relative } : previous))
          try {
            await refreshPaperList()
          } catch {
            // the list refresh is cosmetic
          }
          return result
        } catch (createError) {
          const message = safeError(createError) || t('readerNoteCreateFailed')
          setError(message)
          showToast(message, 'bad')
          return null
        } finally {
          setNoteCreating(false)
        }
      }

      async function openNoteDock() {
        if (!paper || noteCreating) return
        setError('')
        // Re-ask the host each time: the file may have been created, edited or
        // deleted in Obsidian since the panel last looked (spec §14.6).
        let current = readerNote
        // A failed load must be retried on the next click: otherwise its
        // `fetchFailed` marker would keep short-circuiting the handler and the
        // reader would have to reload the page after the host recovered.
        if (!current || !current.exists || current.fetchFailed) current = await refreshReaderNote()
        // A real load failure must not be reported as "no note yet": the reader
        // would go looking for a file that exists while the host is broken.
        if (current?.fetchFailed) {
          showToast(current.fetchError || t('readerNoteLoadFailed'), 'bad')
          return
        }
        // A note the reader already knows about does not need the create round
        // trip; only a genuinely missing file gets created here.
        if (!current?.exists) {
          const created = await createReaderNote(current)
          if (!created) return
          current = created
        }
        // Spec §7.5: open questions stay visible when the panel opens. The GET
        // above already carries them, so this costs no extra round trip and no
        // model call — previously the badge was the only trace of them and the
        // sole way to read them was to re-run 「整理笔记」, which rewrites the body.
        const openQuestions = (current?.questions || []).filter((item) => item?.status === 'open')
        // Never clear an already-open dialog: this only ever adds questions.
        if (openQuestions.length > 0) setNoteQuestions(openQuestions)
        setNoteDock(true)
      }

      async function closeNoteDock() {
        setNoteDock(false)
      }

      // ── Version history (spec §3.5) ───────────────────────────────────────
      // 「整理笔记」 rewrites the body, so the snapshots are the safety net the
      // reader needs in order to undo it. Failures are surfaced, never folded
      // into "no note yet" — a 500 here means the write really failed.
      async function openNoteHistory() {
        if (!paper) return
        setNoteHistoryOpen(true)
        setNoteHistoryLoading(true)
        setNoteHistoryError('')
        try {
          const payload = await request(`/papers/${paper.id}/reader-note/history`)
          setNoteHistoryVersions(readerNoteHistoryList(payload?.versions))
        } catch (historyError) {
          setNoteHistoryVersions([])
          setNoteHistoryError(safeError(historyError) || t('readerNoteHistoryFailed'))
        } finally {
          setNoteHistoryLoading(false)
        }
      }

      async function previewNoteHistory(item) {
        if (!paper || !item?.stamp) return
        // The list already carries everything the preview header needs; the
        // body is fetched lazily so opening the drawer stays one request.
        setNoteHistoryPreview({ loading: true, item, markdown: '' })
        try {
          const payload = await request(
            `/papers/${paper.id}/reader-note/history/${encodeURIComponent(item.stamp)}`,
          )
          setNoteHistoryPreview({ loading: false, item, markdown: String(payload?.markdown || '') })
        } catch (previewError) {
          setNoteHistoryPreview(null)
          showToast(safeError(previewError) || t('readerNoteHistoryFailed'), 'bad')
        }
      }

      async function restoreNoteHistory(item) {
        if (!paper || !item?.stamp || noteHistoryBusy) return
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm(t('noteHistoryRestoreConfirm'))) return
        }
        setNoteHistoryBusy(true)
        try {
          const payload = await request(
            `/papers/${paper.id}/reader-note/history/${encodeURIComponent(item.stamp)}/restore`,
            { method: 'POST' },
          )
          const next = noteResult({
            ...noteDraftState(),
            ...payload,
            exists: true,
            markdown: String(payload?.markdown ?? ''),
          })
          setReaderNote(next)
          setNoteHistoryOpen(false)
          setNoteHistoryPreview(null)
          showToast(t('noteRestoreDone'))
          try {
            await refreshPaperList()
          } catch {
            // cosmetic
          }
        } catch (restoreError) {
          showToast(safeError(restoreError) || t('noteRestoreFailed'), 'bad')
        } finally {
          setNoteHistoryBusy(false)
        }
      }

      async function submitReaderNote(markdown) {
        if (!paper || noteSubmitting) return
        setNoteSubmitting(true)
        try {
          const payload = await request(`/papers/${paper.id}/reader-note/entries`, {
            method: 'POST',
            body: { markdown, baseHash: noteDraftState().hash || undefined },
          })
          const result = noteResult({ ...noteDraftState(), ...payload, exists: true })
          setReaderNote(result)
          clearReaderNoteDraft(paper.id)
          setNoteDock(false)
          showToast(t('readerNoteRecorded'))
          try {
            await refreshPaperList()
          } catch {
            // cosmetic
          }
        } catch (submitError) {
          showToast(safeError(submitError) || t('readerNoteRecordFailed'), 'bad')
        } finally {
          setNoteSubmitting(false)
        }
      }

      function changeNoteHeight(value, persist) {
        const next = Math.max(READER_NOTE_DOCK_MIN, Math.round(Number(value) || READER_NOTE_DOCK_DEFAULT))
        setNoteDockHeight(next)
        if (persist) storeReaderNoteDockHeight(next)
      }

      function changeNoteFont(value) {
        const next = clampReaderNoteFont(value)
        setNoteFont(next)
        try {
          localStorage.setItem('dsh.literature.noteFont.v1', String(next))
        } catch {
          // ignore storage failures
        }
      }

      async function uploadNoteImage({ dataUrl }) {
        if (!paper) throw new Error(t('readerNoteImageFailed'))
        return request(`/papers/${paper.id}/reader-note/images`, {
          method: 'POST',
          body: { dataUrl },
        })
      }

      // 「修改笔记」 (spec §7.6): reuse the existing open-note route.
      async function openReaderNoteInObsidian() {
        if (!paper) return
        const current = await refreshReaderNote()
        if (current?.fetchFailed) {
          showToast(current.fetchError || t('readerNoteLoadFailed'), 'bad')
          return
        }
        const rel = current?.relative || current?.path
        if (!rel) {
          setError(t('readerNoteCreateFailed'))
          return
        }
        try {
          await request('/vault/open-note', { method: 'POST', body: { rel } })
        } catch (openError) {
          setError(safeError(openError))
        }
      }

      // ── 「整理笔记」 (spec §7.5) ───────────────────────────────────────────
      async function organizeReaderNote() {
        if (!paper || noteOrganizing) return
        // Same retry rule as the dock: a remembered failure must not pin the
        // button to "broken" until the page is reloaded.
        const remembered = readerNote
        const current =
          remembered && !remembered.fetchFailed ? remembered : await refreshReaderNote()
        if (current?.fetchFailed) {
          showToast(current.fetchError || t('readerNoteLoadFailed'), 'bad')
          return
        }
        if (!current?.exists) {
          showToast(t('readerNoteOrganizeMissing'), 'bad')
          return
        }
        setNoteOrganizing(true)
        setNoteOrganizeLabel(t('readerNoteOrganizing'))
        try {
          let done = null
          await streamSse(
            `/papers/${paper.id}/reader-note/organize`,
            { baseHash: current.hash || undefined },
            (event) => {
              if (!event) return
              if (event.type === 'status') {
                setNoteOrganizeLabel(event.label || t('readerNoteOrganizing'))
                return
              }
              if (event.type === 'done') done = event
            },
          )
          if (!done) {
            showToast(t('readerNoteOrganizeFailed'), 'bad')
            return
          }
          const result = noteResult({ ...current, markdown: done.markdown, hash: done.hash, exists: true })
          setReaderNote(result)
          // Spec §3.6 names this payload `stats` while §3.6's own summary table
          // and the AI layer call it `report`. Accept either rather than showing
          // 「没有改动」 whenever the host picks the other spelling.
          const stats = done.stats || done.report || {}
          const total = (Number(stats.typos) || 0) + (Number(stats.merges) || 0) + (Number(stats.formatting) || 0)
          showToast(
            total > 0
              ? readerNoteText('readerNoteOrganizeDone', {
                  typos: Number(stats.typos) || 0,
                  merges: Number(stats.merges) || 0,
                  formatting: Number(stats.formatting) || 0,
                })
              : t('readerNoteOrganizeNoChange'),
          )
          const questions = Array.isArray(done.questions) ? done.questions : []
          setNoteQuestions(questions.length > 0 ? questions : null)
          setNoteReplies({})
          try {
            await refreshPaperList()
          } catch {
            // cosmetic
          }
        } catch (organizeError) {
          if (organizeError?.status === 409) {
            showToast(t('readerNoteOrganizeConflict'), 'bad')
            await refreshReaderNote()
          } else if (organizeError?.status === 404) {
            showToast(t('readerNoteOrganizeMissing'), 'bad')
          } else {
            showToast(safeError(organizeError) || t('readerNoteOrganizeFailed'), 'bad')
          }
        } finally {
          setNoteOrganizing(false)
          setNoteOrganizeLabel('')
        }
      }

      async function discussNoteQuestion(question, message) {
        if (!paper || !question?.id || noteDiscussing) return
        setNoteDiscussing(question.id)
        const asked = String(message || '').trim()
        try {
          const lines = []
          await streamSse(
            `/papers/${paper.id}/reader-note/questions/${question.id}/discuss`,
            { message: asked },
            (event) => {
              if (!event) return
              if (event.type === 'delta' && event.text) lines.push(String(event.text))
              if (event.type === 'done' && event.question) {
                updateNoteQuestion(event.question)
              }
            },
          )
          const reply = lines.join('')
          if (reply || asked) {
            setNoteReplies((current) => {
              const thread = Array.isArray(current[question.id]) ? current[question.id].slice() : []
              if (asked) thread.push({ role: 'user', content: asked })
              if (reply) thread.push({ role: 'assistant', content: reply })
              return { ...current, [question.id]: thread }
            })
          }
        } catch (discussError) {
          showToast(safeError(discussError) || t('readerNoteQuestionFailed'), 'bad')
        } finally {
          setNoteDiscussing('')
        }
      }

      function updateNoteQuestion(updated) {
        if (!updated || !updated.id) return
        setNoteQuestions((current) => {
          if (!Array.isArray(current)) return current
          return current.map((item) => (item && item.id === updated.id ? { ...item, ...updated } : item))
        })
      }

      async function resolveNoteQuestion(question, mode) {
        if (!paper || !question?.id || noteDiscussing) return
        setNoteDiscussing(question.id)
        try {
          const payload = await request(
            `/papers/${paper.id}/reader-note/questions/${question.id}/resolve`,
            { method: 'POST', body: { mode } },
          )
          if (payload?.question) updateNoteQuestion(payload.question)
          if (typeof payload?.markdown === 'string' && payload.markdown) {
            setReaderNote((current) => ({ ...noteResult(current), markdown: payload.markdown, hash: payload.hash || '' }))
          }
          showToast(mode === 'dismiss' ? t('readerNoteQuestionDismissed') : t('readerNoteQuestionResolved'))
        } catch (resolveError) {
          const message =
            resolveError?.status === 409
              ? t('readerNoteQuestionFailed')
              : safeError(resolveError) || t('readerNoteQuestionFailed')
          showToast(message, 'bad')
        } finally {
          setNoteDiscussing('')
        }
      }

      // 「在 AI 对话中继续讨论」: hand the fragment to the existing ask flow.
      function askNoteQuestionInChat(question) {
        if (!question) return
        const body = [question.quote, question.problem, question.ask].filter(Boolean).join('\n\n')
        setNoteQuestions(null)
        setView('reader')
        sendQuestion(body, null, 'ask')
      }

      async function handleFile(file) {
        if (!file) return
        if (!/\.pdf$/i.test(file.name)) {
          setError('只支持 PDF 文件')
          return
        }
        if (file.size > 350 * 1024 * 1024) {
          setError('PDF 不能超过 350 MB')
          return
        }
        const controller = new AbortController()
        uploadAbort.current = controller
        setError('')
        setImportState({
          active: true,
          phase: 'uploading',
          percent: 0,
          label: `${t('upload')} · ${file.name}`,
          paperId: '',
          folder: importFolderRef.current || '',
          startedAt: Date.now(),
        })
        try {
          const targetFolder = importFolderRef.current || ''
          const start = await request('/import/start', {
            method: 'POST',
            body: { name: file.name, size: file.size, folder: targetFolder },
            signal: controller.signal,
          })
          const chunkSize = Number(start.chunkSize) || 3 * 1024 * 1024
          let offset = 0
          while (offset < file.size) {
            const slice = file.slice(offset, offset + chunkSize)
            const buffer = await slice.arrayBuffer()
            await request('/import/chunk', {
              method: 'POST',
              body: { uploadId: start.uploadId, data: arrayBufferToBase64(buffer) },
              signal: controller.signal,
            })
            offset += buffer.byteLength
            const percent = Math.min(99, Math.round((offset / file.size) * 100))
            setImportState((current) =>
              current ? { ...current, percent, label: `${t('upload')} ${percent}%` } : current,
            )
          }
          setImportState((current) =>
            current ? { ...current, percent: 100, label: t('uploadDone') } : current,
          )
          const finish = await request('/import/finish', {
            method: 'POST',
            body: { uploadId: start.uploadId },
            signal: controller.signal,
          })
          const nextPaper = finish.paper
          setView('reader')
          setPaper(nextPaper)
          paperRef.current = nextPaper
          upsertPaper(nextPaper)
          {
            const nextFolder = relDir(nextPaper.vaultPath || '')
            importFolderRef.current = nextFolder
            setPendingImportFolder(nextFolder)
          }
          setMessages([])
          setAnnotations([])
          setSelection(null)
          setSummary(null)
          setCurrentPage(1)
          setRangeStart(1)
          setRangeEnd(Math.min(nextPaper.pageCount || 1, 5))
          setChapterValue('')
          localStorage.setItem(LAST_KEY, nextPaper.id)
          lastPaperId.current = nextPaper.id
          setImportState((current) =>
            current
              ? {
                  ...current,
                  phase: 'processing',
                  paperId: nextPaper.id,
                  label: t('processingImport'),
                }
              : current,
          )
          refreshVault(true)
        } catch (uploadError) {
          if (uploadError.name !== 'AbortError') {
            setError(safeError(uploadError) || t('loadFailed'))
            setVaultError(safeError(uploadError) || t('loadFailed'))
          }
          setImportState(null)
        } finally {
          uploadAbort.current = null
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }

      function cancelUpload() {
        uploadAbort.current?.abort()
        setImportState(null)
      }

      function onFilePicked(event) {
        const file = event.target.files?.[0]
        if (file) handleFile(file)
      }

      function onComposerKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
          event.preventDefault()
          if (!sending) sendQuestion(question)
        }
      }

      function stopGeneration() {
        chatAbort.current?.abort()
      }

      const outline = paper?.outline || []
      let selectedChapter = null
      if (chapterValue === '__custom') {
        selectedChapter = {
          title: t('customRange'),
          start: Math.max(1, Math.min(paper?.pageCount || 1, rangeStart || 1)),
          end: Math.max(1, Math.min(paper?.pageCount || 1, rangeEnd || rangeStart || 1)),
        }
      } else if (chapterValue !== '' && outline[Number(chapterValue)]) {
        selectedChapter = outline[Number(chapterValue)]
      }
      if (selectedChapter && selectedChapter.start > selectedChapter.end) {
        selectedChapter = { ...selectedChapter, start: selectedChapter.end, end: selectedChapter.start }
      }
      const allMessages = messages
      const showEmpty = !paper && !booting
      const zoomScale =
        Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(zoom) || ZOOM_DEFAULT)) / 100
      const pagesInnerWidth = `calc(min(100%, 960px) * ${zoomScale.toFixed(4)})`

      function renderViewer() {
        if (!paper) return null
        return h(
          'div',
          { className: 'lr-viewer' },
          h(
            'div',
            { className: 'lr-viewer-top' },
            h(
              'div',
              { className: 'lr-tool-group', role: 'group', 'aria-label': 'annotation tools' },
              h(
                'button',
                {
                  type: 'button',
                  className: `lr-tool tool-select ${mode === 'select' ? 'active' : ''}`,
                  onClick: () => setMode('select'),
                  title: t('selectTool'),
                },
                h(Icon, { name: 'select', size: 14 }),
                h('span', null, t('selectTool')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `lr-tool tool-pen ${mode === 'pen' ? 'active' : ''}`,
                  onClick: () => setMode('pen'),
                  title: t('penTool'),
                },
                h(Icon, { name: 'pen', size: 14 }),
                h('span', null, t('penTool')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `lr-tool tool-eraser ${mode === 'eraser' ? 'active' : ''}`,
                  onClick: () => setMode('eraser'),
                  title: t('eraserTool'),
                },
                h(Icon, { name: 'eraser', size: 14 }),
                h('span', null, t('eraserTool')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `lr-tool tool-pan ${mode === 'pan' ? 'active' : ''}`,
                  onClick: () => setMode('pan'),
                  title: t('panTool'),
                  'aria-label': t('panTool'),
                },
                h(Icon, { name: 'hand', size: 14 }),
                h('span', null, t('panTool')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-tool compact',
                  onClick: undo,
                  title: t('undo'),
                  disabled: annotations.length === 0,
                },
                h(Icon, { name: 'undo', size: 14 }),
              ),
              mode === 'pen' || mode === 'eraser'
                ? h(
                    'div',
                    { className: `lr-tool-options ${mode === 'eraser' ? 'eraser' : 'pen'}` },
                    mode === 'pen'
                      ? h(
                          'div',
                          { className: 'lr-swatches' },
                          [
                            ['#f6c945', '#f6c945'],
                            ['#e5484d', '#e5484d'],
                            ['#2f6feb', '#2f6feb'],
                            ['#111827', '#111827'],
                          ].map(([color, key]) =>
                            h('button', {
                              key,
                              type: 'button',
                              className: `lr-swatch ${penColor === color ? 'active' : ''}`,
                              style: { background: color },
                              onClick: () => {
                                setPenColor(color)
                                if (color === '#f6c945') {
                                  if (penWidth < 8) setPenWidth(12)
                                } else if (penWidth >= 10) {
                                  setPenWidth(4)
                                }
                              },
                              title: color,
                              'aria-label': color,
                            }),
                          ),
                        )
                      : null,
                    h(
                      'label',
                      { className: 'lr-width-control', title: mode === 'pen' ? t('width') : t('eraserSize') },
                      h('span', null, mode === 'pen' ? t('width') : t('eraserSize')),
                      h('input', {
                        type: 'range',
                        min: mode === 'pen' ? 1 : 4,
                        max: mode === 'pen' ? 24 : 48,
                        value: mode === 'pen' ? penWidth : eraserWidth,
                        onChange: (event) =>
                          mode === 'pen'
                            ? setPenWidth(Number(event.target.value))
                            : setEraserWidth(Number(event.target.value)),
                      }),
                      h('span', { className: 'lr-width-value' }, String(mode === 'pen' ? penWidth : eraserWidth)),
                    ),
                  )
                : null,
            ),
            h('div', { className: 'lr-tool-sep' }),
            h(
              'div',
              { className: 'lr-tool-group chapter-group' },
              h('span', { className: 'lr-tool-caption' }, t('chapter')),
              h(
                'label',
                { className: 'lr-select-wrap' },
                h('span', { className: 'lr-sr-only' }, t('chapter')),
                h(
                  'select',
                  {
                    className: 'lr-select',
                    value: chapterValue,
                    onChange: (event) => {
                      const value = event.target.value
                      setChapterValue(value)
                      if (value === '__custom') return
                      const item = outline[Number(value)]
                      if (item) {
                        setRangeStart(item.start)
                        setRangeEnd(item.end)
                        scrollToPage(item.start)
                      }
                    },
                    title: t('chapter'),
                  },
                  h('option', { value: '' }, outlineLoading ? t('outlineLoading') : t('selectChapter')),
                  outline.map((item, index) =>
                    h(
                      'option',
                      { value: String(index), key: `${item.title}-${index}` },
                      `${item.title} · p.${item.start}-${item.end}`,
                    ),
                  ),
                  h('option', { value: '__custom' }, t('customRange')),
                ),
              ),
              chapterValue === '__custom'
                ? h(
                    'div',
                    { className: 'lr-range' },
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: paper.pageCount || 1,
                      value: rangeStart,
                      onChange: (event) =>
                        setRangeStart(Math.max(1, Math.min(paper.pageCount || 1, Number(event.target.value) || 1))),
                      'aria-label': t('startPage'),
                    }),
                    h('span', null, '–'),
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: paper.pageCount || 1,
                      value: rangeEnd,
                      onChange: (event) =>
                        setRangeEnd(Math.max(1, Math.min(paper.pageCount || 1, Number(event.target.value) || 1))),
                      'aria-label': t('endPage'),
                    }),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-tool chapter-extract',
                  disabled: !selectedChapter || sending || summaryRunning || !canChat,
                  onClick: () => runExtract(selectedChapter),
                  title: t('extract'),
                },
                sending ? h(Spinner, { size: 12 }) : h(Icon, { name: 'sparkle', size: 14 }),
                h('span', null, t('extract')),
              ),
            ),
            h(FullscreenButton, { active: fullscreen, onClick: toggleFullscreen }),
          ),
          h(
            'div',
            {
              className: `lr-scroll${mode === 'pan' ? ' mode-pan' : ''}`,
              ref: attachViewer,
              onScroll: onViewerScroll,
              onPointerDown: onViewerPointerDown,
              onPointerMove: onViewerPointerMove,
              onPointerUp: onViewerPointerRelease,
              onPointerCancel: onViewerPointerRelease,
              onLostPointerCapture: endPan,
            },
            h(
              'div',
              { className: 'lr-pages' },
              h(
                'div',
                {
                  className: 'lr-pages-inner',
                  style: { width: pagesInnerWidth },
                },
                Array.from({ length: paper.pageCount || 0 }).map((_, index) => {
                  const pageNumber = index + 1
                  return h(MemoPageView, {
                    key: `${paper.id}-${pageNumber}`,
                    n: pageNumber,
                    url: `${API}/papers/${paper.id}/page/${pageNumber}`,
                    strokes: annotations,
                    selection,
                    bubbleVisible: showBubble,
                    mode,
                    penColor,
                    penWidth,
                    eraserWidth,
                    onSelect: selectRegion,
                    onStroke: addStroke,
                    onErase: eraseAt,
                    onQuickSelection: quickSelection,
                    onUseSelection: useSelection,
                    onClearSelection: clearSelection,
                    registerRef: registerPage,
                  })
                }),
                !paper.pageCount
                  ? h('div', { className: 'lr-page-empty' }, t('noText'))
                  : null,
              ),
            ),
          ),
          h(
            'div',
            { className: 'lr-viewer-bottom' },
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn icon',
                onClick: () => scrollToPage(Math.max(1, currentPage - 1)),
                disabled: currentPage <= 1,
                title: t('chevronLeft'),
              },
              h(Icon, { name: 'chevronLeft', size: 15 }),
            ),
            h(
              'span',
              { className: 'lr-page-indicator' },
              `${currentPage} / ${paper.pageCount || 1}`,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn icon',
                onClick: () => scrollToPage(Math.min(paper.pageCount || 1, currentPage + 1)),
                disabled: currentPage >= (paper.pageCount || 1),
                title: t('chevronRight'),
              },
              h(Icon, { name: 'chevronRight', size: 15 }),
            ),
            h('span', { className: 'lr-sep' }),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn icon',
                onClick: () => zoomBy(-ZOOM_STEP),
                disabled: zoom <= ZOOM_MIN + 0.01,
                title: t('zoomOut'),
                'aria-label': t('zoomOut'),
              },
              h(Icon, { name: 'minus', size: 14 }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-zoom',
                onClick: resetZoom,
                title: t('zoomHint'),
                'aria-label': `${t('zoomReset')} (${Math.round(zoom)}%)`,
              },
              `${Math.round(zoom)}%`,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn icon',
                onClick: () => zoomBy(ZOOM_STEP),
                disabled: zoom >= ZOOM_MAX - 0.01,
                title: t('zoomIn'),
                'aria-label': t('zoomIn'),
              },
              h(Icon, { name: 'plus', size: 14 }),
            ),
          ),
        )
      }

      function renderChat() {
        return h(
          'aside',
          { className: 'lr-chat' },
          h(
            'div',
            { className: 'lr-chat-head' },
            h(
              'div',
              { className: 'lr-chat-title-row' },
              h('span', { className: 'lr-ai-mark' }, h(Icon, { name: 'sparkle', size: 15 })),
              h(
                'div',
                { className: 'lr-chat-heading' },
                h('span', { className: 'lr-chat-title' }, t('aiReader')),
                h(
                  'div',
                  { className: 'lr-chat-status' },
                  isProcessing
                    ? h('span', { className: 'lr-pulse-dot' })
                    : h('span', { className: `lr-dot ${paper?.status === 'ready' ? 'ok' : 'warn'}` }),
                  h(
                    'span',
                    null,
                    isProcessing
                      ? paper?.progress?.label || t('reading')
                      : paper?.analysisReady
                        ? `${t('ready')} · ${pageCountLabel(paper)}`
                        : paper?.analysisError
                          ? t('analysisWarning')
                          : t('noText'),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'lr-model-box' },
                // 「整理笔记」 (spec §7.1): only offered once a note exists. The
                // badge counts the open suspicious findings it reported.
                hasReaderNote
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-btn small lr-note-organize',
                        onClick: organizeReaderNote,
                        disabled: noteOrganizing,
                        title: t('readerNoteOrganize'),
                      },
                      noteOrganizing ? h(Spinner, { size: 12 }) : h(Icon, { name: 'sparkle', size: 13 }),
                      h('span', { className: 'lr-label' }, noteOrganizeLabel || t('readerNoteOrganize')),
                      readerNoteOpen > 0 && !noteOrganizing
                        ? h(
                            'span',
                            { className: 'lr-note-organize-badge', title: readerNoteText('readerNoteBadgeCount', { count: readerNoteOpen }) },
                            String(readerNoteOpen),
                          )
                        : null,
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: `lr-model-pill${modelPickerOpen ? ' open' : ''}`,
                    title: health
                      ? `${t('modelPicker')}：${health.model}${effortLabelOf(health) ? ` · ${effortLabelOf(health)}` : ''}`
                      : t('modelPicker'),
                    onClick: openModelPicker,
                    'aria-haspopup': 'dialog',
                    'aria-expanded': modelPickerOpen,
                  },
                  h(Icon, { name: 'sparkle', size: 10 }),
                  h('span', { className: 'lr-model-pill-label' }, modelNameOf(health)),
                  effortLabelOf(health)
                    ? h('span', { className: 'lr-model-pill-effort' }, effortLabelOf(health))
                    : null,
                  h(Icon, { name: 'chevronRight', size: 10, className: 'lr-model-caret' }),
                ),
                h(ModelPicker, {
                  open: modelPickerOpen,
                  health,
                  groups: modelGroups,
                  loading: modelLoading,
                  error: modelError,
                  busy: modelBusy,
                  onClose: () => setModelPickerOpen(false),
                  onSelect: (next) => applyModelChoice(next),
                  onEffort: chooseEffort,
                }),
              ),
            ),
          ),
          h(
            'div',
            {
              className: `lr-chat-scroll ${allMessages.length === 0 && !streaming ? 'is-empty' : ''}`,
              ref: chatScrollRef,
            },
            paper && !isProcessing ? h(OverviewCard, {
              paper,
              onAnalysis: openAnalysis,
              onSummary: runSummary,
              summaryRunning,
              onOpenNote: openNote,
              onPreview: openSummaryPreview,
              onStudyNote: openStudyNote,
            }) : null,
            paper && isProcessing ? h(ProgressCard, {
              paper,
              onRetry: retryProcessing,
              retrying,
            }) : null,
            paper && paper.status === 'ready' && paper.analysisError ? h(
              'div',
              { className: 'lr-warning-card' },
              h(Icon, { name: 'refresh', size: 14 }),
              h('div', null, paper.analysisError),
              h(
                'button',
                { type: 'button', className: 'lr-btn small', onClick: retryProcessing, disabled: retrying },
                retrying ? h(Spinner, { size: 12 }) : t('retryRead'),
              ),
            ) : null,
            summaryRunning || summary || summaryResult
              ? h(
                  'div',
                  { className: `lr-summary-card ${summaryRunning ? 'running' : ''}` },
                  h(
                    'div',
                    { className: 'lr-summary-head' },
                    summaryRunning ? h(Spinner, { size: 13 }) : h(Icon, { name: 'sparkle', size: 15 }),
                    h('span', null, summaryRunning ? summary?.label || t('summaryRunning') : t('summaryDone')),
                  ),
                  summaryResult
                    ? h(
                        'div',
                        { className: 'lr-summary-body' },
                        summaryResult.tags?.length
                          ? h(
                              'div',
                              { className: 'lr-tags' },
                              summaryResult.tags.map((tag) =>
                                h('span', { className: 'lr-tag', key: tag }, `#${tag}`),
                              ),
                            )
                          : null,
                        h(
                          'div',
                          { className: 'lr-summary-actions' },
                          h(
                            'button',
                            { type: 'button', className: 'lr-btn small primary', onClick: openStudyNote },
                            h(Icon, { name: 'book', size: 13 }),
                            t('noteOpen'),
                          ),
                          summaryResult.hasNote
                            ? h(
                                'button',
                                { type: 'button', className: 'lr-btn small', onClick: openNote },
                                h(Icon, { name: 'note', size: 13 }),
                                t('openObsidian'),
                              )
                            : null,
                          h(
                            'button',
                            { type: 'button', className: 'lr-btn small', onClick: openSummaryPreview },
                            h(Icon, { name: 'book', size: 13 }),
                            t('preview'),
                          ),
                        ),
                      )
                    : null,
                )
              : paper?.hasSummary
                ? h(
                    'div',
                    { className: 'lr-summary-card' },
                    h(
                      'div',
                      { className: 'lr-summary-head' },
                      h(Icon, { name: 'note', size: 15 }),
                      h('span', null, t('summaryDone')),
                    ),
                    h(
                      'div',
                      { className: 'lr-summary-actions' },
                      h(
                        'button',
                        { type: 'button', className: 'lr-btn small primary', onClick: openStudyNote },
                        h(Icon, { name: 'book', size: 13 }),
                        t('noteOpen'),
                      ),
                      h(
                        'button',
                        { type: 'button', className: 'lr-btn small', onClick: openNote },
                        h(Icon, { name: 'note', size: 13 }),
                        t('openObsidian'),
                      ),
                      h(
                        'button',
                        { type: 'button', className: 'lr-btn small', onClick: openSummaryPreview },
                        h(Icon, { name: 'book', size: 13 }),
                        t('preview'),
                      ),
                    ),
                  )
                : null,
            allMessages.length === 0 && !streaming && paper?.analysisReady
              ? h(
                  'div',
                  { className: 'lr-chat-starter' },
                  h('span', { className: 'lr-starter-icon' }, h(Icon, { name: 'sparkle', size: 18 })),
                  h('div', { className: 'lr-starter-title' }, t('emptyChat')),
                  h('div', { className: 'lr-starter-desc' }, t('emptyChatDesc')),
                  h(
                    'div',
                    { className: 'lr-starter-prompts' },
                    [t('starter1'), t('starter2'), t('starter3')].map((text) =>
                      h(
                        'button',
                        {
                          key: text,
                          type: 'button',
                          className: 'lr-starter-chip',
                          onClick: () => {
                            setQuestion(text)
                            setTimeout(() => composerRef.current?.focus(), 30)
                          },
                        },
                        h(Icon, { name: 'arrowUp', size: 11 }),
                        h('span', null, text),
                      ),
                    ),
                  ),
                )
              : null,
            allMessages.map((message) =>
              h(ChatMessage, {
                key: message.id,
                message,
                onCite: (pageNumber) => scrollToPage(pageNumber),
                onExpand: (item) =>
                  setExpandedMessage({
                    title: item.chapter?.title || t('extract'),
                    markdown: item.content,
                  }),
              }),
            ),
            streaming
              ? h(ChatMessage, {
                  key: 'streaming',
                  message: {
                    id: 'streaming',
                    role: 'assistant',
                    content: streaming.content || ' ',
                    kind: 'stream',
                  },
                  onCite: (pageNumber) => scrollToPage(pageNumber),
                  onExpand: () => {},
                })
              : null,
          ),
          h(
            'div',
            { className: 'lr-composer-wrap' },
            paper ? h(
              'div',
              { className: 'lr-quick-row' },
              h(
                'span',
                { className: 'lr-quick-label' },
                h(Icon, { name: 'sparkle', size: 11 }),
                t('quickAsk'),
              ),
              [
                ['translate', t('translate'), true, 'quote'],
                ['term', t('term'), true, 'book'],
                ['explain', t('explain'), false, 'sparkle'],
                ['points', t('points'), false, 'list'],
                ['critique', t('critique'), false, 'target'],
              ].map(([kind, label, needsSelection, icon]) =>
                h(
                  'button',
                  {
                    key: kind,
                    type: 'button',
                    className: 'lr-chip',
                    disabled: sending || summaryRunning || !canChat || (needsSelection && !selection),
                    onClick: () => startAsk(kind, selectionRef.current),
                    title: needsSelection && !selection ? t('noSelection') : label,
                  },
                  h(Icon, { name: icon, size: 12 }),
                  h('span', null, label),
                ),
              ),
            ) : null,
            h(
              'div',
              { className: `lr-composer ${canChat ? '' : 'disabled'}` },
              selection
                ? h(
                    'div',
                    { className: 'lr-selection-context' },
                    h('span', { className: 'lr-selection-dot' }),
                    h(
                      'span',
                      null,
                      t('selectionContext').replace('{page}', String(selection.page)),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lr-context-clear',
                        onClick: clearSelection,
                        title: t('clearSelection'),
                      },
                      h(Icon, { name: 'close', size: 11 }),
                    ),
                  )
                : h(
                    'div',
                    { className: 'lr-page-context' },
                    h(Icon, { name: 'book', size: 11 }),
                    t('pageContext').replace('{page}', String(currentPage)),
                  ),
              h('textarea', {
                ref: composerRef,
                className: 'lr-textarea',
                value: question,
                placeholder: canChat ? t('questionPlaceholder') : t('chatDisabled'),
                disabled: !canChat || sending || summaryRunning,
                rows: 2,
                onChange: (event) => setQuestion(event.target.value),
                onKeyDown: onComposerKeyDown,
                onInput: (event) => {
                  const target = event.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(140, target.scrollHeight)}px`
                },
              }),
              h(
                'div',
                { className: 'lr-composer-actions' },
                h(
                  'span',
                  { className: 'lr-composer-hint' },
                  sending ? t('stopGeneration') : 'Enter ↵ · Shift+Enter',
                ),
                sending
                  ? h(
                      'button',
                      { type: 'button', className: 'lr-btn small', onClick: stopGeneration },
                      h(Icon, { name: 'close', size: 12 }),
                      t('stop'),
                    )
                  : null,
                h(
                  'div',
                  { className: 'lr-font-step', role: 'group', 'aria-label': t('fontSize') },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn icon small',
                      onClick: () => setTextScale((value) => Math.max(70, value - 10)),
                      disabled: textScale <= 70,
                      title: t('fontSizeSmaller'),
                      'aria-label': t('fontSizeSmaller'),
                    },
                    h(Icon, { name: 'minus', size: 11 }),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-font-value',
                      onClick: () => setTextScale(100),
                      title: `${t('fontSizeTitle')} · ${t('fontSizeReset')}`,
                    },
                    `${Math.round(textScale)}%`,
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn icon small',
                      onClick: () => setTextScale((value) => Math.min(220, value + 10)),
                      disabled: textScale >= 220,
                      title: t('fontSizeLarger'),
                      'aria-label': t('fontSizeLarger'),
                    },
                    h(Icon, { name: 'plus', size: 11 }),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-send',
                    onClick: () => sendQuestion(question),
                    disabled: !canChat || sending || summaryRunning || !question.trim(),
                    title: t('send'),
                  },
                  sending ? h(Spinner, { size: 14 }) : h(Icon, { name: 'arrowUp', size: 15 }),
                ),
              ),
            ),
          ),
        )
      }

      // A paper has a reader note when the route says so, and — because the
      // route may not be deployed yet — when the paper payload claims one.
      const hasReaderNote = Boolean(readerNote?.exists || paper?.hasReaderNote)
      const readerNoteOpen = Number(
        readerNote?.questions?.filter?.((item) => item && item.status === 'open').length ?? paper?.readerNoteOpen ?? 0,
      )

      function renderHeader() {
        return h(
          'header',
          { className: 'lr-header' },
          h(
            'div',
            { className: 'lr-header-left' },
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn lr-library-entry',
                onClick: () => setView('library'),
                title: t('library'),
              },
              h(Icon, { name: 'book', size: 15 }),
              h('span', { className: 'lr-label' }, t('library')),
              (vaultLibrary?.stats?.pdfs || papers.length) > 0
                ? h(
                    'span',
                    { className: 'lr-count' },
                    String(vaultLibrary?.stats?.pdfs || papers.length),
                  )
                : null,
            ),
            paper
              ? h(
                  'div',
                  { className: 'lr-title-block' },
                  h('div', { className: 'lr-title', title: paper.title }, paper.title),
                  h(
                    'div',
                    { className: 'lr-subtitle' },
                    h(
                      'span',
                      { className: 'lr-subtitle-main' },
                      paper.authors?.length ? paper.authors.slice(0, 2).join(', ') : paper.fileName,
                    ),
                    paper.year ? h('span', { className: 'lr-meta-chip' }, String(paper.year)) : null,
                    h('span', { className: 'lr-meta-chip' }, pageCountLabel(paper)),
                  ),
                )
              : h('div', { className: 'lr-title-block' }, h('div', { className: 'lr-title' }, t('panel'))),
          ),
          h(
            'div',
            { className: 'lr-header-actions' },
            paper
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn icon',
                    onClick: openAnalysis,
                    disabled: !paper?.analysisReady,
                    title: t('analysisTitle'),
                  },
                  h(Icon, { name: 'book', size: 15 }),
                )
              : null,
            paper?.hasSummary
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn icon',
                    onClick: openNote,
                    title: t('openObsidian'),
                  },
                  h(Icon, { name: 'note', size: 15 }),
                )
              : null,
            // 「建立笔记」/「记录笔记」+「修改笔记」(spec §7.1).
            paper
              ? hasReaderNote
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn primary lr-note-entry',
                      onClick: openNoteDock,
                      // No accelerator here: nothing is wired for a global
                      // shortcut, and Ctrl+Shift+N is reserved by the browser
                      // (new incognito window) so a page cannot claim it.
                      title: t('readerNoteRecord'),
                    },
                    h(Icon, { name: 'note', size: 14 }),
                    h('span', { className: 'lr-label' }, t('readerNoteRecord')),
                    readerNoteOpen > 0
                      ? h('span', { className: 'lr-note-entry-badge' }, String(readerNoteOpen))
                      : null,
                  )
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn lr-note-entry',
                      onClick: openNoteDock,
                      disabled: noteCreating,
                      title: t('readerNoteCreate'),
                    },
                    noteCreating ? h(Spinner, { size: 13 }) : h(Icon, { name: 'note', size: 14 }),
                    h('span', { className: 'lr-label' }, noteCreating ? t('readerNoteCreating') : t('readerNoteCreate')),
                  )
              : null,
            hasReaderNote
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn icon',
                    onClick: openReaderNoteInObsidian,
                    title: t('readerNoteEdit'),
                    'aria-label': t('readerNoteEdit'),
                  },
                  h(Icon, { name: 'pen', size: 15 }),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'lr-btn',
                onClick: () => requestImport(currentImportFolder()),
                title: `${t('import')} → ${currentImportFolder() || t('vaultRoot')}`,
              },
              h(Icon, { name: 'upload', size: 15 }),
              h('span', { className: 'lr-label' }, t('import')),
            ),
            paper
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn primary',
                    onClick: runSummary,
                    disabled: sending || summaryRunning || !canChat,
                    title: t('summary'),
                  },
                  summaryRunning ? h(Spinner, { size: 13 }) : h(Icon, { name: 'sparkle', size: 14 }),
                  h('span', { className: 'lr-label' }, paper.hasSummary ? t('regenerateSummary') : t('summary')),
                )
              : null,
          ),
        )
      }

      function renderImportOverlay() {
        if (!importState?.active) return null
        return h(
          'div',
          { className: 'lr-modal-backdrop' },
          h(
            'div',
            { className: 'lr-modal lr-import-modal', role: 'dialog', 'aria-modal': 'true' },
            h('div', { className: 'lr-import-icon' }, h(PanelIcon, { size: 30 })),
            h(
              'div',
              { className: 'lr-import-title' },
              importState.phase === 'uploading' ? t('upload') : t('processingImport'),
            ),
            h('div', { className: 'lr-import-file' }, importState.label),
            importState.folder !== undefined
              ? h(
                  'div',
                  { className: 'lr-import-note' },
                  `${t('importHere')}：${importState.folder || t('vaultRoot')}`,
                )
              : null,
            h(
              'div',
              { className: 'lr-progress-track large' },
              h('div', {
                className: `lr-progress-fill ${importState.phase === 'processing' || importState.percent >= 100 ? 'indeterminate' : ''}`,
                style: { width: `${Math.max(5, importState.percent || 0)}%` },
              }),
            ),
            importState.phase === 'uploading'
              ? h(
                  'div',
                  { className: 'lr-import-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'lr-btn', onClick: cancelUpload },
                    t('cancel'),
                  ),
                )
              : h(
                  'div',
                  { className: 'lr-import-note' },
                  paper?.progress?.label || t('processing'),
                ),
          ),
        )
      }

      function renderFileInput() {
        return h('input', {
          ref: fileInputRef,
          type: 'file',
          accept: 'application/pdf,.pdf',
          className: 'lr-file-input',
          onChange: onFilePicked,
        })
      }

      if (view === 'note' && paper) {
        return h(
          'div',
          { className: 'lr-root lr-note-root', style: { '--lr-fs': String(textScale / 100) } },
          h('style', null, CSS),
          h(NoteView, {
            paper,
            onBack: () => setView('reader'),
            onCitePage: (pageNumber) => {
              setView('reader')
              setTimeout(() => scrollToPage(pageNumber), 60)
            },
            onOpenObsidian: openNote,
            onRegenerate: () => {
              setView('reader')
              setTimeout(() => runSummary(), 60)
            },
            showToast,
            onPaperChanged: (patch) => {
              setPaper((current) => (current ? { ...current, hasSummary: true, ...patch } : current))
              setPapers((current) =>
                current.map((item) =>
                  item.id === paper.id ? { ...item, hasSummary: true, ...patch } : item,
                ),
              )
            },
          }),
          h(Toast, { toast }),
        )
      }

      if (view === 'library') {
        return h(
          'div',
          { className: 'lr-root lr-library-root' },
          h('style', null, CSS),
          h(VaultLibraryView, {
            data: vaultLibrary,
            loading: vaultLoading || (!vaultLibrary && !vaultError),
            error: vaultError,
            busy: vaultBusy,
            onRefresh: (refresh) => refreshVault(refresh !== false),
            onOpenPdf: openVaultPdf,
            onOpenNote: openVaultNote,
            onOpenLegacy: openLegacyPaper,
            onImport: requestImport,
            onSave: saveVaultItem,
            onCreateFolder: createLibraryFolder,
            onMoveEntry: moveLibraryEntry,
            onRenameFolder: renameLibraryFolder,
            onDeleteEntry: deleteLibraryEntry,
            onDeleteCache: deleteCachedLibraryItem,
            dataDir: health?.dataDir || '',
            onBack: () => {
              setVaultError('')
              setView('reader')
            },
          }),
          renderFileInput(),
          renderImportOverlay(),
          h(Toast, { toast }),
        )
      }

      if (booting) {
        return h(
          'div',
          { className: 'lr-root', style: { '--lr-fs': String(textScale / 100) } },
          h('style', null, CSS),
          h(
            'div',
            { className: 'lr-boot' },
            h(PanelIcon, { size: 38 }),
            h(Spinner, { size: 18 }),
            h('span', null, t('panel')),
          ),
        )
      }

      if (showEmpty) {
        return h(
          'div',
          { className: 'lr-root', style: { '--lr-fs': String(textScale / 100) } },
          h('style', null, CSS),
          renderFileInput(),
          renderHeader(),
          error
            ? h(
                'div',
                { className: 'lr-error-banner' },
                h(Icon, { name: 'close', size: 14 }),
                h('span', null, error),
                h(
                  'button',
                  { type: 'button', className: 'lr-error-close', onClick: () => setError('') },
                  h(Icon, { name: 'close', size: 12 }),
                ),
              )
            : null,
          h(
            'div',
            { className: 'lr-empty' },
            h(
              'div',
              { className: 'lr-empty-card' },
              h(
                'div',
                { className: 'lr-empty-icon' },
                h(PanelIcon, { size: 40 }),
              ),
              h('h1', { className: 'lr-empty-title' }, t('emptyTitle')),
              h('p', { className: 'lr-empty-desc' }, t('emptyDesc')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lr-btn primary large',
                  onClick: () => requestImport(currentImportFolder()),
                },
                h(Icon, { name: 'upload', size: 16 }),
                t('emptyImport'),
              ),
              h(
                'div',
                { className: 'lr-feature-grid' },
                [
                  ['sparkle', t('featureRead'), t('featureReadDesc')],
                  ['select', t('featureAsk'), t('featureAskDesc')],
                  ['note', t('featureNote'), t('featureNoteDesc')],
                ].map(([icon, title, description]) =>
                  h(
                    'div',
                    { className: 'lr-feature', key: title },
                    h('span', { className: 'lr-feature-icon' }, h(Icon, { name: icon, size: 16 })),
                    h('div', null, h('div', { className: 'lr-feature-title' }, title), h('div', { className: 'lr-feature-desc' }, description)),
                  ),
                ),
              ),
              papers.length > 0
                ? h(
                    'div',
                    { className: 'lr-recent' },
                    h('div', { className: 'lr-recent-title' }, t('libraryHint')),
                    papers.slice(0, 3).map((item) =>
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lr-recent-row',
                          key: item.id,
                          onClick: () => choosePaper(item.id),
                        },
                        h(Icon, { name: 'book', size: 13 }),
                        h('span', { className: 'lr-recent-name' }, item.title),
                        h('span', { className: 'lr-recent-meta' }, pageCountLabel(item)),
                      ),
                    ),
                  )
                : null,
            ),
          ),
          renderImportOverlay(),
          h(Toast, { toast }),
        )
      }

      return h(
        'div',
        {
          className: 'lr-root',
          style: { '--lr-fs': String(textScale / 100) },
        },
        h('style', null, CSS),
        renderFileInput(),
        renderHeader(),
        error
          ? h(
              'div',
              { className: 'lr-error-banner' },
              h(Icon, { name: 'close', size: 14 }),
              h('span', null, error),
              h(
                'button',
                { type: 'button', className: 'lr-error-close', onClick: () => setError('') },
                h(Icon, { name: 'close', size: 12 }),
              ),
            )
          : null,
        paper
          ? h(
              'div',
              {
                className: `lr-split ${resizing ? 'resizing' : ''}`,
                ref: splitRef,
                style: { '--lr-viewer-width': `${splitPercent}%` },
              },
              renderViewer(),
              h(
                'div',
                {
                  className: 'lr-divider',
                  role: 'separator',
                  'aria-orientation': 'vertical',
                  title: t('resizeHint'),
                  onPointerDown: beginSplit,
                  onDoubleClick: () => setSplitPercent(74),
                },
                h('span', { className: 'lr-divider-grip' }),
              ),
              renderChat(),
            )
          : h(
              'div',
              { className: 'lr-empty' },
              h(
                'div',
                { className: 'lr-empty-card' },
                h('div', { className: 'lr-empty-icon' }, h(PanelIcon, { size: 40 })),
                h('h2', { className: 'lr-empty-title' }, t('emptyTitle')),
                h('p', { className: 'lr-empty-desc' }, t('emptyDesc')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lr-btn primary large',
                    onClick: () => requestImport(currentImportFolder()),
                  },
                  h(Icon, { name: 'upload', size: 16 }),
                  t('emptyImport'),
                ),
              ),
            ),
        // The record panel is a flex sibling, never an overlay (spec §7.2):
        // opening it shrinks the split instead of covering the PDF or the chat.
        // On ≤860px it becomes a full-page editor (spec §14.1).
        paper
          ? h(ReaderNoteDock, {
              open: noteDock,
              narrow: noteNarrow,
              paperId: paper.id,
              height: noteDockHeight,
              font: noteFont,
              submitting: noteSubmitting,
              onFontChange: changeNoteFont,
              onHeightChange: changeNoteHeight,
              onSubmit: submitReaderNote,
              onClose: closeNoteDock,
              onUploadImage: uploadNoteImage,
              onToast: showToast,
              onHistory: openNoteHistory,
            })
          : null,
        renderImportOverlay(),
        // Version history of the reader note (spec §3.5): the safety net behind
        // 「整理笔记」. The list is fetched on open, one snapshot read lazily.
        h(NoteHistoryDrawer, {
          open: noteHistoryOpen,
          loading: noteHistoryLoading,
          versions: noteHistoryVersions,
          error: noteHistoryError,
          busy: noteHistoryBusy,
          onClose: () => {
            setNoteHistoryOpen(false)
            setNoteHistoryPreview(null)
          },
          onPreview: previewNoteHistory,
          onRestore: restoreNoteHistory,
          labelOf: (item) => readerNoteHistoryLabel(item.reason),
          emptyText: t('readerNoteHistoryEmpty'),
        }),
        noteHistoryPreview
          ? h(
              Modal,
              {
                title: t('readerNoteHistoryPreview'),
                subtitle: noteHistoryPreview.item?.updatedAt
                  ? noteFormatTime(noteHistoryPreview.item.updatedAt)
                  : '',
                onClose: () => setNoteHistoryPreview(null),
                wide: true,
                // Opened from the dock, which is a full-page layer on narrow
                // screens: the preview has to sit above it (spec §14.1).
                elevated: true,
              },
              noteHistoryPreview.loading
                ? h('div', { className: 'lr-modal-loading' }, h(Spinner, { size: 18 }), t('noteHistoryLoading'))
                : h(
                    'div',
                    { className: 'lr-note-preview' },
                    renderReaderNotePreview(noteHistoryPreview.markdown, paper?.id || ''),
                    h(
                      'div',
                      { className: 'lr-note-preview-actions' },
                      h('span', { className: 'lr-note-preview-note' }, t('noteHistoryPreviewReadOnly')),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lr-btn small primary',
                          disabled: noteHistoryBusy,
                          onClick: () => restoreNoteHistory(noteHistoryPreview.item),
                        },
                        noteHistoryBusy ? h(Spinner, { size: 12 }) : h(Icon, { name: 'refresh', size: 13 }),
                        t('noteHistoryRestore'),
                      ),
                    ),
                  ),
            )
          : null,
        // 「整理笔记」 reports what it changed and then asks about anything it
        // refused to touch (spec §7.5): suspicious facts stay user-confirmed.
        noteQuestions
          ? h(ReaderNoteQuestionsDialog, {
              questions: noteQuestions,
              busyId: noteDiscussing,
              replies: noteReplies,
              onClose: () => setNoteQuestions(null),
              onDiscuss: discussNoteQuestion,
              onAskInChat: askNoteQuestionInChat,
              onResolve: resolveNoteQuestion,
            })
          : null,
        glossaryAsk
          ? h(GlossaryConfirmDialog, {
              questions: glossaryAsk.questions,
              includeCount: (glossaryAsk.include || []).length,
              onClose: () => setGlossaryAsk(null),
              onConfirm: (picked) => {
                const include = glossaryAsk.include || []
                setGlossaryAsk(null)
                // Full replacement: include + picked. Never picked alone.
                generateSummary(glossaryOverrideFor(include, picked))
              },
            })
          : null,
        analysisModal
          ? h(
              Modal,
              {
                title: analysisModal.title,
                subtitle: paper?.title,
                onClose: () => setAnalysisModal(null),
                wide: true,
              },
              analysisModal.loading
                ? h('div', { className: 'lr-modal-loading' }, h(Spinner, { size: 18 }), t('reading'))
                : h(Markdown, { text: analysisModal.markdown, onCite: (pageNumber) => { setAnalysisModal(null); scrollToPage(pageNumber) } }),
            )
          : null,
        summaryModal
          ? h(
              Modal,
              {
                title: summaryModal.title,
                subtitle: paper?.title,
                onClose: () => setSummaryModal(null),
                wide: true,
              },
              summaryModal.loading
                ? h('div', { className: 'lr-modal-loading' }, h(Spinner, { size: 18 }), t('summaryRunning'))
                : h(
                    'div',
                    { className: 'lr-note-preview' },
                    h(Markdown, { text: summaryModal.markdown, onCite: (pageNumber) => { setSummaryModal(null); scrollToPage(pageNumber) } }),
                    // The preview stays read-only; this is the only way into the
                    // editor from here, so the modal has to offer it.
                    paper
                      ? h(
                          'div',
                          { className: 'lr-note-preview-actions' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lr-btn small primary',
                              onClick: () => {
                                setSummaryModal(null)
                                openStudyNote()
                              },
                            },
                            h(Icon, { name: 'book', size: 13 }),
                            t('noteOpen'),
                          ),
                        )
                      : null,
                  ),
            )
          : null,
        expandedMessage
          ? h(
              Modal,
              {
                title: expandedMessage.title,
                subtitle: paper?.title,
                onClose: () => setExpandedMessage(null),
                wide: true,
              },
              h(Markdown, { text: expandedMessage.markdown, onCite: (pageNumber) => { setExpandedMessage(null); scrollToPage(pageNumber) } }),
            )
          : null,
        wordNotice
          ? h(
              Modal,
              {
                title: t('wordDuplicateTitle'),
                subtitle: t('wordDuplicateSubtitle'),
                onClose: () => setWordNotice(null),
              },
              h(
                'div',
                { className: 'lr-word-notice' },
                h('div', { className: 'lr-word-term' }, wordNotice.term),
                h(
                  'div',
                  { className: 'lr-word-dup' },
                  t('wordDuplicateBody')
                    .replace('{term}', () => wordNotice.term)
                    .replace('{note}', () => wordNotice.note)
                    .replace('{number}', () => String(wordNotice.number))
                    .replace('{translation}', () => wordNotice.translation),
                ),
                h('div', { className: 'lr-word-hint' }, t('wordDuplicateHint')),
                wordNotice.section
                  ? h(
                      'div',
                      { className: 'lr-word-hint' },
                      t('wordDuplicateSection').replace('{section}', () => wordNotice.section),
                    )
                  : null,
                h(
                  'div',
                  { className: 'lr-word-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lr-btn primary',
                      onClick: () => setWordNotice(null),
                    },
                    t('close'),
                  ),
                ),
              ),
            )
          : null,
        h(Toast, { toast }),
      )
    }

    const CSS = `
.lr-root{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;overflow:hidden}
/* Page fullscreen keeps the wallpaper and shell.overlay widgets mounted; the
   Windows caption strip is reserved by a custom property, so zero it here. The
   Desktop application menu is a fixed child of the page, so hide it too. */
html:fullscreen{--dsh-windows-titlebar-height:0px!important}
html:fullscreen .lr-header{display:none}
html:fullscreen [data-windows-menu]{display:none!important}
/* A collapsed Windows sidebar keeps its reopen/new-session buttons fixed in
   the caption strip; they would float over the reader (and after the caption
   is zeroed, sit half-clipped at the top edge). Hide the collapsed column and
   the macOS leading seat for the duration of the mode. */
html:fullscreen [data-sidebar-collapsed] > :first-child{display:none!important}
html:fullscreen [data-shell-leading]{display:none!important}
.lr-root *{box-sizing:border-box}
.lr-icon{flex:0 0 auto;display:block}
.lr-header{height:56px;flex:0 0 56px;display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);min-width:0}
.lr-header-left{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
.lr-header-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
.lr-title-block{min-width:0;display:flex;flex-direction:column;gap:2px;justify-content:center}
.lr-title{font-size:14px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(48vw,720px)}
.lr-subtitle{font-size:11px;line-height:1.3;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(48vw,720px)}
.lr-count{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:10px;color:var(--dsw-alias-label-secondary)}
.lr-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .08s ease}
.lr-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.lr-btn:active:not(:disabled){transform:translateY(1px)}
.lr-btn:disabled{opacity:.42;cursor:not-allowed}
.lr-btn.icon{width:30px;padding:0}
.lr-btn.small{height:26px;padding:0 8px;font-size:11.5px;border-radius:7px;gap:5px}
.lr-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.lr-btn.primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary)}
.lr-btn.large{height:38px;padding:0 16px;font-size:13px;border-radius:10px;gap:8px}
.lr-file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px}
.lr-error-banner{display:flex;align-items:center;gap:8px;padding:8px 12px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-base));border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 25%,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.4}
.lr-error-banner span{flex:1;min-width:0}
.lr-error-close{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:4px}
.lr-split{flex:1;min-height:0;display:flex;overflow:hidden}
.lr-viewer{position:relative;flex:0 0 var(--lr-viewer-width,74%);width:var(--lr-viewer-width,74%);min-width:320px;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2)}
.lr-divider{position:relative;flex:0 0 7px;width:7px;align-self:stretch;background:var(--dsw-alias-bg-base);cursor:col-resize;touch-action:none;display:flex;align-items:center;justify-content:center;z-index:9}
.lr-divider:before{content:"";position:absolute;inset:0 3px;background:var(--dsw-alias-border-l1);transition:background .15s ease}
.lr-divider:hover:before,.lr-divider:active:before,.lr-split.resizing .lr-divider:before{background:var(--dsw-alias-brand-primary)}
.lr-divider-grip{position:relative;z-index:1;width:3px;height:32px;border-radius:99px;background:var(--dsw-alias-border-l2);box-shadow:0 0 0 2px var(--dsw-alias-bg-base);transition:background .15s ease}
.lr-divider:hover .lr-divider-grip,.lr-split.resizing .lr-divider-grip{background:var(--dsw-alias-brand-primary)}
.lr-split.resizing,.lr-split.resizing *{user-select:none!important}
.lr-viewer-top{display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);position:relative;z-index:8}
.lr-tool-group{display:flex;align-items:center;gap:3px;min-width:0}
.lr-tool{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;transition:all .15s ease}
.lr-tool:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-tool.active{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);color:var(--dsw-alias-brand-primary)}
.lr-tool.compact{width:28px;padding:0;justify-content:center}
.lr-tool:disabled{opacity:.4;cursor:not-allowed}
.lr-tool.chapter-extract{color:var(--dsw-alias-brand-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 34%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent);padding:0 9px;font-weight:500}
.lr-tool.chapter-extract:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}
.lr-fullscreen-tool{margin-left:auto}
.lr-width-control{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap}
.lr-width-control input[type=range]{width:64px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.lr-width-value{min-width:16px;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.lr-tool-sep{width:1px;height:18px;background:var(--dsw-alias-border-l1);margin:0 3px}
.lr-swatches{display:flex;align-items:center;gap:4px;padding-left:4px}
.lr-swatch{width:16px;height:16px;padding:0;border:2px solid transparent;border-radius:50%;cursor:pointer;box-shadow:0 0 0 1px var(--dsw-alias-border-l2)}
.lr-swatch.active{border-color:var(--dsw-alias-bg-base);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}
.lr-select-wrap{position:relative;display:inline-flex}
.lr-select{height:28px;max-width:250px;padding:0 24px 0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px;text-overflow:ellipsis;cursor:pointer;appearance:none}
.lr-select:focus{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);outline-offset:1px}
.lr-select-wrap:after{content:"";position:absolute;right:9px;top:11px;width:5px;height:5px;border-right:1.5px solid var(--dsw-alias-label-secondary);border-bottom:1.5px solid var(--dsw-alias-label-secondary);transform:rotate(45deg);pointer-events:none}
.lr-range{display:flex;align-items:center;gap:3px;color:var(--dsw-alias-label-secondary);font-size:11px}
.lr-range input{width:48px;height:28px;padding:0 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11px;text-align:center}
.lr-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.lr-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}
.lr-scroll.mode-pan{cursor:grab;touch-action:none}
.lr-scroll.panning,.lr-scroll.panning *{cursor:grabbing!important;user-select:none!important}
.lr-scroll::-webkit-scrollbar,.lr-chat-scroll::-webkit-scrollbar,.lr-modal-body::-webkit-scrollbar{width:8px;height:8px}
.lr-scroll::-webkit-scrollbar-thumb,.lr-chat-scroll::-webkit-scrollbar-thumb,.lr-modal-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.lr-pages{padding:24px 26px 82px;display:flex;justify-content:flex-start;min-height:100%}
.lr-pages-inner{display:flex;flex:0 0 auto;flex-direction:column;gap:22px;min-width:0;margin:0 auto}
.lr-page{position:relative;width:100%;min-width:0;scroll-margin-top:16px}
.lr-page-no{font-size:10.5px;color:var(--dsw-alias-label-secondary);padding:0 2px 6px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.lr-page-paper{position:relative;background:#fff;border-radius:3px;box-shadow:0 1px 3px rgba(15,23,42,.12),0 8px 26px rgba(15,23,42,.09);overflow:visible;touch-action:none}
.lr-page-paper.mode-select{cursor:crosshair}
.lr-page-paper.mode-pen{cursor:crosshair}
.lr-page-paper.mode-eraser{cursor:cell}
.lr-page-paper.mode-pan{cursor:grab}
.lr-page-paper img{display:block;width:100%;height:auto;min-height:280px;border-radius:3px;user-select:none;-webkit-user-drag:none;background:#fff}
.lr-page-paper.loading img{min-height:68vh}
.lr-anno-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;border-radius:3px}
.lr-select-box{position:absolute;border:1.5px solid #2f6feb;background:rgba(47,111,235,.14);border-radius:2px;pointer-events:none;z-index:4;box-shadow:0 0 0 1px rgba(255,255,255,.65) inset,0 0 0 1px rgba(47,111,235,.18)}
.lr-select-box.persistent{background:rgba(47,111,235,.08);border-style:dashed}
.lr-bubble{position:absolute;z-index:7;display:flex;align-items:center;gap:2px;padding:3px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:9px;box-shadow:0 6px 20px rgba(15,23,42,.18);pointer-events:auto}
.lr-bubble-btn{height:25px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.lr-bubble-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.lr-bubble-btn.primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}
.lr-bubble-btn.primary:hover{background:var(--dsw-alias-brand-primary);filter:brightness(1.06)}
.lr-bubble-close{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:5px}
.lr-bubble-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-page-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.55);pointer-events:none;border-radius:3px}
.lr-viewer-bottom{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:2px;height:36px;padding:3px 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:11px;background:var(--dsw-alias-bg-overlay);box-shadow:0 6px 22px rgba(15,23,42,.16);backdrop-filter:blur(8px)}
.lr-viewer-bottom .lr-btn{height:27px;width:27px;border:0;background:transparent}
.lr-viewer-bottom .lr-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.lr-page-indicator{min-width:52px;text-align:center;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.lr-sep{width:1px;height:17px;background:var(--dsw-alias-border-l1);margin:0 3px}
.lr-zoom{min-width:46px;height:24px;padding:0 6px;border:0;border-radius:6px;background:transparent;text-align:center;font-family:inherit;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap}
.lr-zoom:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-zoom:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lr-chat{flex:1 1 0;min-width:220px;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)}
.lr-chat-head{flex:0 0 auto;padding:12px 14px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.lr-chat-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lr-chat-title{font-size:12.5px;font-weight:600;letter-spacing:.01em}
.lr-model-box{position:relative;flex:0 0 auto;display:flex;align-items:center}
.lr-model-pill{display:inline-flex;align-items:center;gap:4px;height:24px;max-width:min(250px,46vw);padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:10px;line-height:1;cursor:pointer;transition:border-color .15s ease,color .15s ease,background .15s ease}
.lr-model-pill:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.lr-model-pill.open{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,transparent);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.lr-model-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lr-model-pill-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-model-pill-effort{flex:0 0 auto;padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:color-mix(in srgb,var(--dsw-alias-brand-primary) 82%,var(--dsw-alias-label-primary));font-size:8.5px;letter-spacing:.02em;white-space:nowrap}
.lr-model-caret{transform:rotate(90deg);opacity:.7;flex:0 0 auto}
.lr-model-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:70;width:min(320px,86vw);max-height:min(430px,72vh);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 48px rgba(15,23,42,.24);animation:lr-pop .14s ease;overflow:hidden}
.lr-model-pop-head{display:flex;align-items:center;gap:8px;padding:10px 10px 8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.lr-model-pop-title{flex:1;font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.lr-model-pop-head .lr-btn.icon.small{width:22px;height:22px;padding:0}
.lr-model-pop-sub{padding:8px 12px 0;font-size:9.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.lr-model-pop-body{flex:1;min-height:0;overflow:auto;padding:8px 8px 10px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin}
.lr-model-pop-empty{padding:16px 8px;font-size:10.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);text-align:center}
.lr-model-pop-empty.error{color:var(--dsw-alias-state-error-primary)}
.lr-model-pop-hint{margin-top:4px;font-size:9.5px;opacity:.82}
.lr-model-group{display:flex;flex-direction:column;gap:2px}
.lr-model-group-name{padding:2px 6px 3px;font-size:9px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.lr-model-row{display:flex;align-items:center;gap:6px;width:100%;min-width:0;height:28px;padding:0 7px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:10.5px;text-align:left;cursor:pointer}
.lr-model-row:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-model-row:disabled{opacity:.55;cursor:progress}
.lr-model-row.active{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);color:var(--dsw-alias-brand-primary)}
.lr-model-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-model-flag{flex:0 0 auto;font-size:8.5px;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.lr-model-flag.warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary)}
.lr-model-pop-foot{flex:0 0 auto;padding:9px 10px 10px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:7px}
.lr-model-pop-foot.muted{font-size:9.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);border-top:0;padding-top:0}
.lr-effort-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:9.5px;color:var(--dsw-alias-label-secondary)}
.lr-effort-active{font-size:9px;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.lr-effort-row{display:flex;flex-wrap:wrap;gap:4px}
.lr-effort{height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:9.5px;line-height:1;cursor:pointer;transition:border-color .15s ease,color .15s ease,background .15s ease}
.lr-effort:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.lr-effort:disabled{opacity:.55;cursor:progress}
.lr-effort.active{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 11%,transparent);color:var(--dsw-alias-brand-primary)}
.lr-effort:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lr-chat-status{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.35;min-height:15px}
.lr-chat-status span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-chat-scroll{flex:1;min-height:0;overflow:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain;scrollbar-width:thin}
.lr-overview{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px;display:flex;flex-direction:column;gap:8px}
.lr-overview-head{display:flex;align-items:center;gap:6px;min-height:18px}
.lr-overview-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary);flex:1}
.lr-overview-text{font-size:calc(12.5px * var(--lr-fs,1));line-height:1.62;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.lr-overview-text.expanded{-webkit-line-clamp:unset;display:block}
.lr-overview-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.lr-overview-actions .lr-btn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.lr-tags{display:flex;flex-wrap:wrap;gap:4px}
.lr-tag{display:inline-flex;align-items:center;height:19px;padding:0 6px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-2));border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);font-size:9.5px;line-height:1;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.lr-tag.tiny{height:17px;font-size:9px;padding:0 5px}
.lr-link-btn{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font-family:inherit;font-size:10.5px;padding:0;cursor:pointer;text-align:left}
.lr-link-btn:hover{text-decoration:underline}
.lr-mini-action{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 5px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:9.5px;cursor:pointer}
.lr-mini-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:0 0 auto}
.lr-dot.ok{background:var(--dsw-alias-state-success-primary)}
.lr-dot.warn{background:var(--dsw-alias-state-warn-primary)}
.lr-dot.bad{background:var(--dsw-alias-state-error-primary)}
.lr-progress-card{border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 24%,var(--dsw-alias-border-l1));border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 5%,var(--dsw-alias-bg-layer-1));padding:9px 10px;display:flex;flex-direction:column;gap:7px}
.lr-progress-head{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-primary);line-height:1.4}
.lr-progress-head span{flex:1;min-width:0}
.lr-progress-track{width:100%;height:4px;border-radius:99px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.lr-progress-track.large{height:5px}
.lr-progress-fill{height:100%;border-radius:99px;background:var(--dsw-alias-brand-primary);transition:width .35s ease}
.lr-progress-fill.indeterminate{width:36%!important;animation:lr-indeterminate 1.4s ease-in-out infinite}
.lr-progress-note{font-size:9.5px;color:var(--dsw-alias-label-secondary)}
.lr-warning-card{display:flex;align-items:flex-start;gap:7px;flex-wrap:wrap;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 25%,var(--dsw-alias-border-l1));border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 6%,var(--dsw-alias-bg-layer-1));padding:9px 10px;font-size:10.5px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.lr-warning-card>div{flex:1;min-width:60%}
.lr-summary-card{border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-border-l1));border-radius:11px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,var(--dsw-alias-bg-layer-1));padding:9px 10px;display:flex;flex-direction:column;gap:7px}
.lr-summary-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600}
.lr-summary-body{display:flex;flex-direction:column;gap:7px}
.lr-summary-actions{display:flex;gap:5px;flex-wrap:wrap}
.lr-summary-actions .lr-btn{flex:1}
.lr-font-step{display:inline-flex;align-items:center;gap:1px;margin-left:auto;margin-right:2px;padding:1px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1)}
.lr-font-step .lr-btn.icon.small{width:20px;height:20px;min-width:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary)}
.lr-font-step .lr-btn.icon.small:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-font-value{height:20px;min-width:34px;padding:0 3px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:9px;font-variant-numeric:tabular-nums;line-height:1;cursor:pointer}
.lr-font-value:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-font-step .lr-btn.icon.small:focus-visible,.lr-font-value:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lr-chat-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;padding:16px 8px;color:var(--dsw-alias-label-secondary)}
.lr-chat-empty-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.lr-chat-empty-desc{font-size:10.5px;line-height:1.5}
.lr-msg{display:flex;flex-direction:column;gap:3px;min-width:0;animation:lr-fade .18s ease both}
.lr-msg.user{align-items:flex-end}
.lr-msg-meta{display:flex;align-items:center;gap:5px;min-height:15px;color:var(--dsw-alias-label-secondary);font-size:9.5px}
.lr-msg-avatar{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-brand-primary);font-size:7.5px;font-weight:700;letter-spacing:.02em}
.lr-msg-role{line-height:1}
.lr-msg-body{min-width:0;font-size:calc(13.5px * var(--lr-fs,1));line-height:1.7;overflow-wrap:anywhere}
.lr-msg.user .lr-msg-body{max-width:94%;padding:7px 9px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1));border-radius:11px 11px 3px 11px}
.lr-msg.assistant .lr-msg-body{padding:0 1px}
.lr-msg.error .lr-msg-body{color:var(--dsw-alias-state-warn-primary)}
.lr-user-text{white-space:pre-wrap;line-height:1.6;font-size:calc(13.5px * var(--lr-fs,1))}
.lr-sel-thumb{display:block;max-width:100%;max-height:130px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);margin-bottom:6px;object-fit:contain;background:#fff}
.lr-msg-foot{margin-top:4px;font-size:9.5px;color:var(--dsw-alias-label-secondary)}
.lr-md{font-size:calc(13.5px * var(--lr-fs,1));line-height:1.72;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.lr-md>*:first-child{margin-top:0}
.lr-md>*:last-child{margin-bottom:0}
.lr-md-p{margin:0 0 7px;white-space:pre-wrap}
.lr-md-h{margin:12px 0 6px;font-weight:650;line-height:1.35;color:var(--dsw-alias-label-primary)}
.lr-md-h1{font-size:calc(17px * var(--lr-fs,1))}
.lr-md-h2{font-size:calc(15.5px * var(--lr-fs,1))}
.lr-md-h3{font-size:calc(14px * var(--lr-fs,1))}
.lr-md-h4{font-size:calc(13.5px * var(--lr-fs,1))}
.lr-md-list{margin:4px 0 8px;padding-left:18px}
.lr-md-list li{margin:2px 0}
.lr-md-quote{margin:8px 0;padding:6px 9px;border-left:2px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);border-radius:0 6px 6px 0;color:var(--dsw-alias-label-secondary)}
.lr-md-hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:11px 0}
.lr-pre{margin:8px 0;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:auto;font-size:calc(12px * var(--lr-fs,1));line-height:1.5}
.lr-inline-code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-size:calc(12px * var(--lr-fs,1));font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.lr-cite{display:inline;border:0;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-brand-primary);font-family:inherit;font-size:9.5px;line-height:1.4;padding:0 3px;margin:0 1px;border-radius:4px;cursor:pointer;white-space:nowrap}
.lr-cite:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,var(--dsw-alias-bg-layer-2))}
.lr-table-wrap{overflow:auto;margin:8px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:7px}
.lr-table{border-collapse:collapse;width:100%;font-size:calc(12px * var(--lr-fs,1))}
.lr-table th,.lr-table td{border-bottom:1px solid var(--dsw-alias-border-l1);padding:5px 7px;text-align:left;vertical-align:top}
.lr-table th{background:var(--dsw-alias-bg-layer-1);font-weight:600}
.lr-table tr:last-child td{border-bottom:0}
.lr-composer-wrap{flex:0 0 auto;padding:10px 12px 8px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.lr-quick-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:6px;min-height:23px}
.lr-quick-label{font-size:9.5px;color:var(--dsw-alias-label-secondary);margin-right:1px}
.lr-chip{display:inline-flex;align-items:center;height:23px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:calc(10px * var(--lr-fs,1));cursor:pointer;white-space:nowrap;transition:all .13s ease}
.lr-chip:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.lr-chip:disabled{opacity:.38;cursor:not-allowed}
.lr-composer{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);padding:7px 7px 5px;display:flex;flex-direction:column;gap:3px;transition:border-color .15s ease,box-shadow .15s ease}
.lr-composer:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-border-l1));box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.lr-composer.disabled{opacity:.72}
.lr-page-context,.lr-selection-context{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;height:18px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;line-height:1}
.lr-selection-context{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-brand-primary);gap:5px}
.lr-selection-dot{width:5px;height:5px;border-radius:50%;background:currentColor}
.lr-context-clear{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:3px}
.lr-context-clear:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
.lr-textarea{width:100%;min-height:42px;max-height:140px;padding:3px 2px;border:0;outline:0;resize:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:calc(13px * var(--lr-fs,1));line-height:1.6;display:block}
.lr-textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}
.lr-textarea:disabled{cursor:not-allowed}
.lr-composer-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;min-height:25px}
.lr-composer-hint{flex:1;min-width:0;font-size:9px;color:var(--dsw-alias-label-secondary);opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-send{display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border:0;border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);cursor:pointer}
.lr-send:hover:not(:disabled){filter:brightness(1.08)}
.lr-send:disabled{opacity:.4;cursor:not-allowed}
.lr-foot{display:flex;align-items:center;gap:4px;margin-top:5px;min-height:15px;overflow:hidden}
.lr-foot-spacer{flex:1}
.lr-foot .lr-link-btn{font-size:9.5px;white-space:nowrap}
.lr-empty{flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:32px 24px;background:radial-gradient(circle at 30% 15%,color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,transparent),transparent 48%),var(--dsw-alias-bg-base)}
.lr-empty-card{width:min(660px,100%);display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:34px 30px;border:1px solid var(--dsw-alias-border-l1);border-radius:18px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 72%,transparent);box-shadow:0 20px 60px rgba(15,23,42,.08)}
.lr-empty-icon{display:flex;align-items:center;justify-content:center;width:68px;height:68px;border-radius:20px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.lr-empty-title{margin:2px 0 0;font-size:23px;line-height:1.25;font-weight:650;letter-spacing:-.02em}
.lr-empty-desc{max-width:520px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.7}
.lr-feature-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%;margin-top:10px;text-align:left}
.lr-feature{display:flex;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.lr-feature-icon{display:flex;align-items:center;justify-content:center;flex:0 0 26px;height:26px;border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-brand-primary)}
.lr-feature-title{font-size:11px;font-weight:600;margin-bottom:2px}
.lr-feature-desc{font-size:10px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.lr-recent{width:100%;margin-top:8px;text-align:left}
.lr-recent-title{font-size:10px;color:var(--dsw-alias-label-secondary);margin:4px 2px 5px}
.lr-recent-row{display:flex;align-items:center;gap:7px;width:100%;padding:6px 8px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11px;cursor:pointer;text-align:left}
.lr-recent-row:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.lr-recent-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-recent-meta{font-size:9.5px;color:var(--dsw-alias-label-secondary)}
.lr-boot{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;color:var(--dsw-alias-label-secondary);font-size:12px}
.lr-spinner{display:inline-block;border:2px solid color-mix(in srgb,currentColor 22%,transparent);border-top-color:currentColor;border-radius:50%;animation:lr-spin .8s linear infinite;flex:0 0 auto}
.lr-drawer-backdrop{position:absolute;inset:0;z-index:30;background:rgba(15,23,42,.34);display:flex;animation:lr-fade .15s ease}
.lr-drawer{width:380px;max-width:92%;height:100%;background:var(--dsw-alias-bg-base);border-right:1px solid var(--dsw-alias-border-l1);box-shadow:16px 0 50px rgba(15,23,42,.16);display:flex;flex-direction:column;animation:lr-slide-in .18s ease}
.lr-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:12px 13px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.lr-drawer-title{font-size:13px;font-weight:600}
.lr-drawer-search{display:flex;align-items:center;gap:7px;margin:9px 11px;padding:0 9px;height:32px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.lr-drawer-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px}
.lr-drawer-list{flex:1;overflow:auto;padding:2px 8px 10px}
.lr-drawer-empty{padding:30px 10px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.lr-library-row{display:flex;align-items:flex-start;gap:6px;padding:9px;border:1px solid transparent;border-radius:9px;cursor:pointer;margin-bottom:2px}
.lr-library-row:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1)}
.lr-library-row.active{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-border-l1))}
.lr-library-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.lr-library-row-title{display:flex;align-items:flex-start;gap:5px;font-size:11.5px;font-weight:550;line-height:1.4}
.lr-library-row-title .lr-dot{margin-top:5px}
.lr-library-row-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lr-library-row-meta{font-size:9.5px;color:var(--dsw-alias-label-secondary);padding-left:11px}
.lr-library-row .lr-tags{padding-left:11px}
.lr-row-delete{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0}
.lr-library-row:hover .lr-row-delete{opacity:1}
.lr-row-delete:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.lr-drawer-foot{padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.lr-drawer-foot .lr-btn{width:100%}
.lr-modal-backdrop{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:24px;animation:lr-fade .15s ease;backdrop-filter:blur(2px)}
.lr-modal{width:min(660px,94vw);max-height:86vh;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:15px;background:var(--dsw-alias-bg-base);box-shadow:0 24px 80px rgba(15,23,42,.32);overflow:hidden;animation:lr-pop .18s ease}
.lr-modal.wide{width:min(920px,94vw)}
.lr-import-modal{width:min(430px,92vw);padding:28px 26px 22px;align-items:center;gap:10px;text-align:center}
.lr-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.lr-modal-titles{min-width:0}
.lr-modal-title{font-size:14px;font-weight:650;line-height:1.3}
.lr-modal-subtitle{margin-top:3px;font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72vw}
.lr-modal-body{flex:1;min-height:0;overflow:auto;padding:20px 24px 26px;font-size:13px;line-height:1.7}
.lr-glossary{display:flex;flex-direction:column;gap:12px}
.lr-glossary-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lr-glossary-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.lr-glossary-list{display:flex;flex-direction:column;gap:2px;max-height:min(52vh,420px);overflow:auto;border:1px solid var(--lr-line);border-radius:10px;padding:4px}
.lr-glossary-row{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:12.5px;line-height:1.5}
.lr-glossary-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.lr-glossary-row.checked{background:color-mix(in srgb,var(--lr-accent) 9%,transparent)}
.lr-glossary-row input{flex:0 0 auto;width:14px;height:14px;accent-color:var(--lr-accent);cursor:pointer}
.lr-glossary-term{font-weight:600;color:var(--dsw-alias-label-primary)}
.lr-glossary-trans{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-glossary-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}
.lr-modal-body .lr-md{font-size:13px;line-height:1.75}
.lr-modal-body .lr-md-h1{font-size:19px}
.lr-modal-body .lr-md-h2{font-size:17px}
.lr-modal-body .lr-md-h3{font-size:15px}
.lr-modal-body .lr-md-h4{font-size:14px}
.lr-modal-body .lr-md-p{margin-bottom:10px}
.lr-modal-body .lr-md-list{margin-bottom:12px}
.lr-modal-loading{display:flex;align-items:center;justify-content:center;gap:9px;padding:48px 0;color:var(--dsw-alias-label-secondary);font-size:12px}
.lr-word-notice{display:flex;flex-direction:column;gap:11px;font-size:12.5px;line-height:1.7;color:var(--lr-muted)}
.lr-word-term{font-size:21px;font-weight:650;line-height:1.25;color:var(--lr-ink);letter-spacing:-.01em;overflow-wrap:anywhere}
.lr-word-dup{padding:10px 12px;border:1px solid color-mix(in srgb,var(--lr-warm) 32%,var(--lr-line));border-radius:10px;background:color-mix(in srgb,var(--lr-warm) 9%,transparent);color:var(--dsw-alias-label-primary)}
.lr-word-hint{font-size:11px;line-height:1.6;color:var(--lr-muted)}
.lr-word-actions{display:flex;justify-content:flex-end;margin-top:4px}
.lr-import-icon{display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:16px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary)}
.lr-import-title{font-size:15px;font-weight:600;margin-top:4px}
.lr-import-file{width:100%;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.lr-import-modal .lr-progress-track{width:100%;margin-top:3px}
.lr-import-note{min-height:18px;font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.5}
.lr-import-actions{display:flex;justify-content:center;margin-top:2px}
.lr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:7px;max-width:min(560px,90%);padding:9px 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 30px rgba(15,23,42,.18);font-size:11.5px;color:var(--dsw-alias-label-primary);animation:lr-toast-in .2s ease}
.lr-toast.warn{color:var(--dsw-alias-state-warn-primary)}
.lr-toast.error{color:var(--dsw-alias-state-error-primary)}
.lr-page-empty{padding:60px 0;text-align:center;color:var(--dsw-alias-label-secondary)}
.lr-library-root{background:var(--dsw-alias-bg-base)}
.lr-library{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.lr-library-head{flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}
.lr-library-head-left{display:flex;align-items:center;gap:14px;min-width:0;flex:1}
.lr-library-title-block{min-width:0;display:flex;flex-direction:column;gap:3px}
.lr-library-title{font-size:19px;font-weight:650;letter-spacing:-.015em;line-height:1.2}
.lr-library-path{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64vw}
.lr-library-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
.lr-dest-chip{display:inline-flex;align-items:center;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;height:18px;padding:0 6px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-label-primary-foreground) 15%,transparent);font-size:9.5px;opacity:.9}
.lr-library-body{flex:1;min-height:0;display:flex;overflow:hidden}
.lr-folder-pane{flex:0 0 246px;width:246px;min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);padding:10px 8px 20px;scrollbar-width:thin}
.lr-folder-row{display:flex;align-items:center;gap:6px;width:100%;height:31px;padding:0 8px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;text-align:left;cursor:pointer;white-space:nowrap;min-width:0}
.lr-folder-row:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-folder-row.active{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent);color:var(--dsw-alias-brand-primary)}
.lr-folder-row.root{font-weight:600}
.lr-folder-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.lr-folder-count{flex:0 0 auto;font-size:9.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.lr-folder-divider{height:1px;background:var(--dsw-alias-border-l1);margin:8px 6px}
.lr-folder-list{display:flex;flex-direction:column;gap:1px}
.lr-library-main{flex:1;min-width:0;min-height:0;overflow:auto;padding:14px 18px 40px;scrollbar-width:thin}
.lr-library-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.lr-library-tabs{display:flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
.lr-library-tab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;cursor:pointer}
.lr-library-tab span{font-size:9.5px;color:var(--dsw-alias-label-secondary);padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2)}
.lr-library-tab:hover{color:var(--dsw-alias-label-primary)}
.lr-library-tab.active{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(15,23,42,.08)}
.lr-library-search{display:flex;align-items:center;gap:7px;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);flex:1;min-width:180px;max-width:420px}
.lr-library-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px}
.lr-check{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:10.5px;cursor:pointer;white-space:nowrap}
.lr-rename-note{margin-top:2px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:5px}
.lr-rename-note .lr-check{color:var(--dsw-alias-label-primary);font-size:11px;white-space:normal;flex-direction:row;align-items:center;gap:7px}
.lr-rename-note .lr-check input{width:16px;height:16px;min-width:16px;padding:0;margin:0;flex:0 0 auto}
.lr-rename-note-target{font-size:10.5px;color:var(--dsw-alias-label-secondary);word-break:break-all;line-height:1.45}
.lr-check input{accent-color:var(--dsw-alias-brand-primary)}
.lr-library-breadcrumb{display:flex;align-items:center;gap:6px;margin-top:12px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0}
.lr-library-breadcrumb>span:nth-child(2){color:var(--dsw-alias-label-primary);font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-library-count{display:inline-flex;align-items:center;height:17px;padding:0 5px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);font-size:9.5px}
.lr-library-sync{margin-left:auto;font-size:9.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}
.lr-drag-hint{display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:9.5px;color:var(--lr-muted);white-space:nowrap;flex:0 0 auto}
.lr-library-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:260px;color:var(--dsw-alias-label-secondary);font-size:12px}
.lr-pdf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:12px;margin-top:14px}
.lr-pdf-card{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);transition:border-color .15s ease,background .15s ease,transform .15s ease}
.lr-pdf-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);transform:translateY(-1px)}
.lr-pdf-card-top{display:flex;align-items:center;gap:6px;min-height:20px}
.lr-pdf-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-brand-primary);flex:0 0 auto}
.lr-status-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9.5px;white-space:nowrap}
.lr-status-pill.ok{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,var(--dsw-alias-bg-layer-2))}
.lr-status-pill.warn{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,var(--dsw-alias-bg-layer-2))}
.lr-status-pill.bad{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,var(--dsw-alias-bg-layer-2))}
.lr-status-pill .lr-dot{width:5px;height:5px}
.lr-status-pill.idle .lr-dot{background:var(--dsw-alias-state-idle-primary)}
.lr-status-pill.ok .lr-dot{background:var(--dsw-alias-state-success-primary)}
.lr-status-pill.warn .lr-dot{background:var(--dsw-alias-state-warn-primary)}
.lr-status-pill.bad .lr-dot{background:var(--dsw-alias-state-error-primary)}
.lr-summary-pill{display:inline-flex;align-items:center;height:19px;padding:0 6px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-brand-primary);font-size:9px;white-space:nowrap}
.lr-pdf-title{font-size:13px;font-weight:600;line-height:1.42;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:37px}
.lr-pdf-path{display:flex;align-items:center;gap:4px;font-size:9.5px;color:var(--dsw-alias-label-secondary);min-width:0;line-height:1.4}
.lr-pdf-path span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-pdf-sep{opacity:.5;flex:0 0 auto}
.lr-pdf-notags{font-size:10px;color:var(--dsw-alias-label-secondary);min-height:19px}
.lr-note-link{display:flex;align-items:center;gap:4px;max-width:100%;height:23px;padding:0 6px;border:1px dashed var(--dsw-alias-border-l2);border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:9.5px;cursor:pointer;overflow:hidden;text-align:left}
.lr-note-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.lr-note-link:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.lr-pdf-footer{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:3px}
.lr-pdf-footer .lr-btn{flex:1}
.lr-library-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:220px;margin-top:14px;border:1px dashed var(--dsw-alias-border-l1);border-radius:12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.lr-note-list{display:flex;flex-direction:column;gap:7px;margin-top:14px}
.lr-note-card{display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.lr-note-card:hover{border-color:var(--dsw-alias-border-l2)}
.lr-note-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.lr-note-title-row{display:flex;align-items:center;gap:6px;min-width:0}
.lr-note-title{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-note-path{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-detached{margin-top:26px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:14px}
.lr-detached-title{font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-bottom:7px}
.lr-detached-list{display:flex;flex-direction:column;gap:4px}
.lr-detached-row{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);font-size:11px}
.lr-detached-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-edit-form{display:flex;flex-direction:column;gap:13px}
.lr-edit-form label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.lr-edit-form input{width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;outline:none}
.lr-edit-form input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.lr-filename-input{display:flex;align-items:center}
.lr-filename-input input{border-radius:8px 0 0 8px;flex:1}
.lr-filename-input span{display:inline-flex;align-items:center;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-left:0;border-radius:0 8px 8px 0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px}
.lr-edit-note{display:flex;align-items:flex-start;gap:6px;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.lr-edit-warning{display:flex;align-items:flex-start;gap:6px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 24%,var(--dsw-alias-border-l1));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 6%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.5}
.lr-edit-error{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.5}
.lr-edit-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:3px}
/* ─────────────────────────────────────────────────────────────────────────
   Visual refresh: warm paper base, single confident accent, clearer tools.
   All colours derive from DSH theme tokens so dark mode keeps working.
   ───────────────────────────────────────────────────────────────────────── */
.lr-root{
  --lr-accent:var(--dsw-alias-brand-primary);
  --lr-tint:color-mix(in srgb,var(--lr-accent) 6%,var(--dsw-alias-bg-base));
  /* Warm glass follows the active wallpaper: dsh-wallpaper re-tints
     brand-primary with the scene accent and exposes --dwp-wash for the scene
     glass; both have transparent fallbacks when that plugin is inactive. */
  --lr-glass:color-mix(in srgb,var(--lr-accent) 16%,var(--dwp-wash,transparent));
  --lr-glass-strong:color-mix(in srgb,var(--lr-accent) 27%,var(--dwp-wash,transparent));
  --lr-accent-line:color-mix(in srgb,var(--lr-accent) 50%,var(--dsw-alias-border-l1));
  --lr-line:color-mix(in srgb,var(--lr-accent) 13%,var(--dsw-alias-border-l1));
  --lr-warm:#b97309;
  --lr-warm-soft:color-mix(in srgb,#eab308 12%,var(--dsw-alias-bg-layer-1));
  --lr-rose:#be123c;
  --lr-rose-soft:color-mix(in srgb,#fb7185 12%,var(--dsw-alias-bg-layer-1));
  --lr-teal:#0d9488;
  --lr-teal-soft:color-mix(in srgb,#14b8a6 12%,var(--dsw-alias-bg-layer-1));
  --lr-ink:var(--dsw-alias-label-primary);
  --lr-muted:var(--dsw-alias-label-secondary);
  --lr-shadow:0 18px 40px rgba(12,10,8,.28);
  --lr-soft-shadow:0 2px 10px rgba(12,10,8,.14);
  background:
    radial-gradient(760px 360px at 94% -8%,color-mix(in srgb,var(--lr-accent) 12%,transparent),transparent 62%),
    radial-gradient(560px 320px at -6% 108%,color-mix(in srgb,var(--lr-accent) 6%,transparent),transparent 60%),
    var(--dsw-alias-bg-base);
  -webkit-font-smoothing:antialiased;
}
.lr-root ::selection{background:color-mix(in srgb,var(--lr-accent) 24%,transparent);color:var(--lr-ink)}
.lr-header{height:60px;flex:0 0 60px;padding:0 16px;gap:14px;position:relative;border-bottom:1px solid var(--lr-line);background:linear-gradient(180deg,var(--lr-tint),transparent 82%),var(--dsw-alias-bg-base)}
.lr-header:after{content:"";position:absolute;left:16px;right:16px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--lr-accent) 30%,transparent),transparent);pointer-events:none}
.lr-header-left{gap:14px}
.lr-header-actions{gap:8px}
.lr-title{font-size:15px;font-weight:650;letter-spacing:-.012em;line-height:1.28}
.lr-subtitle{display:flex;align-items:center;gap:6px;font-size:10.5px;letter-spacing:.01em;min-width:0}
.lr-subtitle-main{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:34vw}
.lr-meta-chip{display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--lr-line);color:var(--lr-muted);font-size:9px;font-variant-numeric:tabular-nums;white-space:nowrap}
.lr-btn.lr-library-entry{border-color:color-mix(in srgb,var(--lr-accent) 24%,transparent);background:color-mix(in srgb,var(--lr-accent) 9%,var(--dwp-wash,transparent));font-weight:550;color:var(--lr-ink);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent)}
.lr-library-entry svg{color:color-mix(in srgb,var(--lr-accent) 70%,var(--lr-ink))}
.lr-btn.lr-library-entry:hover:not(:disabled){border-color:color-mix(in srgb,var(--lr-accent) 38%,transparent);background:color-mix(in srgb,var(--lr-accent) 15%,var(--dwp-wash,transparent))}
.lr-count{background:var(--lr-accent);border:1px solid color-mix(in srgb,var(--lr-accent) 65%,#000 12%);color:var(--dsw-alias-label-primary-foreground);min-width:18px;height:18px;padding:0 5px;border-radius:6px;font-size:9.5px;font-weight:650;font-variant-numeric:tabular-nums;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 28%,transparent)}
.lr-btn{height:32px;padding:0 12px;border-radius:9px;border-color:var(--lr-line);font-weight:500;font-size:12px;gap:6px;transition:background .16s ease,border-color .16s ease,color .16s ease,box-shadow .18s ease,transform .1s ease}
.lr-btn:hover:not(:disabled){background:var(--lr-tint);border-color:color-mix(in srgb,var(--lr-accent) 30%,var(--dsw-alias-border-l1))}
.lr-btn:active:not(:disabled){transform:translateY(1px) scale(.99)}
.lr-btn.small{height:28px;padding:0 9px;border-radius:8px;font-size:11.5px}
.lr-btn.icon{width:32px;height:32px}
.lr-btn.icon.small{width:28px;height:28px}
.lr-btn.primary{background:var(--lr-glass-strong);border-color:var(--lr-accent-line);color:color-mix(in srgb,var(--lr-accent) 55%,var(--lr-ink));font-weight:600;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 22%,transparent),inset 0 -1px 0 color-mix(in srgb,#000 16%,transparent),0 6px 18px color-mix(in srgb,var(--lr-accent) 16%,transparent)}
.lr-btn.primary:hover:not(:disabled){background:color-mix(in srgb,var(--lr-accent) 36%,var(--dwp-wash,transparent));border-color:color-mix(in srgb,var(--lr-accent) 68%,var(--dsw-alias-border-l1));color:color-mix(in srgb,var(--lr-accent) 38%,var(--lr-ink));filter:none;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 26%,transparent),inset 0 -1px 0 color-mix(in srgb,#000 14%,transparent),0 8px 22px color-mix(in srgb,var(--lr-accent) 22%,transparent)}
.lr-btn.primary:disabled{box-shadow:none}
.lr-btn.primary svg{color:currentColor}
.lr-btn.accent{background:color-mix(in srgb,var(--lr-accent) 9%,transparent);border-color:color-mix(in srgb,var(--lr-accent) 24%,var(--lr-line));color:color-mix(in srgb,var(--lr-accent) 72%,var(--lr-muted));font-weight:600}
.lr-btn.accent:hover:not(:disabled){background:color-mix(in srgb,var(--lr-accent) 16%,transparent);border-color:color-mix(in srgb,var(--lr-accent) 38%,var(--lr-line));color:color-mix(in srgb,var(--lr-accent) 62%,var(--lr-ink))}
.lr-btn:focus-visible,.lr-tool:focus-visible,.lr-zoom:focus-visible{outline:2px solid color-mix(in srgb,var(--lr-accent) 55%,transparent);outline-offset:2px}
.lr-viewer{background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 4%,var(--dsw-alias-bg-layer-2)),var(--dsw-alias-bg-layer-2) 120px)}
.lr-viewer-top{padding:8px 12px;gap:8px;border-bottom:1px solid var(--lr-line);background:linear-gradient(180deg,var(--lr-tint),color-mix(in srgb,var(--dsw-alias-bg-base) 96%,transparent))}
.lr-tool{height:30px;border-radius:9px;padding:0 9px;font-size:11.5px;font-weight:500;color:var(--lr-muted)}
.lr-tool svg{transition:color .15s ease}
.lr-tool.tool-select svg{color:color-mix(in srgb,var(--lr-accent) 72%,var(--lr-muted))}
.lr-tool.tool-pen svg{color:color-mix(in srgb,var(--lr-warm) 78%,var(--lr-muted))}
.lr-tool.tool-eraser svg{color:color-mix(in srgb,var(--lr-rose) 78%,var(--lr-muted))}
.lr-tool.tool-pan svg{color:color-mix(in srgb,var(--lr-teal) 78%,var(--lr-muted))}
.lr-tool:hover{background:var(--lr-tint);color:var(--lr-ink)}
.lr-tool.active{border-color:transparent}
.lr-tool.tool-select.active{background:color-mix(in srgb,var(--lr-accent) 13%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--lr-accent) 30%,transparent);color:var(--lr-accent)}
.lr-tool.tool-pen.active{background:var(--lr-warm-soft);border-color:color-mix(in srgb,#d97706 34%,transparent);color:color-mix(in srgb,var(--lr-warm) 72%,var(--lr-ink))}
.lr-tool.tool-eraser.active{background:var(--lr-rose-soft);border-color:color-mix(in srgb,#e11d48 26%,transparent);color:color-mix(in srgb,var(--lr-rose) 72%,var(--lr-ink))}
.lr-tool.tool-pan.active{background:var(--lr-teal-soft);border-color:color-mix(in srgb,#0d9488 32%,transparent);color:color-mix(in srgb,var(--lr-teal) 72%,var(--lr-ink))}
.lr-tool.compact{width:30px;border-radius:8px}
.lr-tool-options{display:flex;align-items:center;gap:7px;height:32px;padding:0 8px;border:1px solid var(--lr-line);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 88%,var(--lr-tint));box-shadow:var(--lr-soft-shadow)}
.lr-tool-options.eraser{background:color-mix(in srgb,#fb7185 4%,var(--dsw-alias-bg-base));border-color:color-mix(in srgb,#fb7185 18%,var(--lr-line))}
.lr-swatches{padding-left:0;gap:5px}
.lr-swatch{width:17px;height:17px;border-width:2px;transition:transform .12s ease}
.lr-swatch:hover{transform:scale(1.1)}
.lr-swatch.active{border-color:var(--dsw-alias-bg-base);box-shadow:0 0 0 2px var(--lr-accent)}
.lr-width-control{height:26px;padding:0;border:0;background:transparent;gap:6px;font-size:10px;letter-spacing:.02em}
.lr-width-control input[type=range]{width:66px}
.lr-width-value{font-weight:600;color:var(--lr-ink);font-size:10.5px}
.lr-tool-caption{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--lr-muted);font-weight:600;margin-right:2px}
.lr-select{height:30px;border-radius:8px;border-color:var(--lr-line);background:var(--dsw-alias-bg-base);font-size:11.5px}
.lr-select:focus{outline:2px solid color-mix(in srgb,var(--lr-accent) 40%,transparent)}
.lr-tool.chapter-extract{height:30px;border-radius:9px;background:color-mix(in srgb,var(--lr-accent) 8%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--lr-accent) 30%,transparent);color:var(--lr-accent)}
.lr-tool.chapter-extract:hover:not(:disabled){background:color-mix(in srgb,var(--lr-accent) 14%,var(--dsw-alias-bg-layer-1))}
.lr-tool-sep{height:20px;opacity:.7}
.lr-range input{border-color:var(--lr-line)}
.lr-pages{padding:26px 28px 86px}
.lr-page-no{display:inline-flex;align-items:center;gap:5px;font-size:10px;letter-spacing:.05em;color:var(--lr-muted);padding:0 2px 8px}
.lr-page-paper{border-radius:4px;box-shadow:0 1px 2px rgba(12,10,8,.2),0 18px 46px rgba(12,10,8,.3)}
.lr-page-paper img{border-radius:4px}
.lr-viewer-bottom{border-color:var(--lr-line);box-shadow:var(--lr-shadow)}
.lr-chat{border-left:1px solid var(--lr-line);background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 8%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base) 170px)}
.lr-chat-head{padding:12px 14px 11px;border-bottom:1px solid var(--lr-line);background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 5%,var(--dsw-alias-bg-base)),transparent)}
.lr-chat-title-row{gap:9px;align-items:center}
.lr-ai-mark{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;background:var(--lr-glass);border:1px solid color-mix(in srgb,var(--lr-accent) 34%,transparent);color:color-mix(in srgb,var(--lr-accent) 52%,var(--lr-ink));box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 20%,transparent),0 3px 10px color-mix(in srgb,var(--lr-accent) 14%,transparent);flex:0 0 auto}
.lr-chat-heading{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lr-chat-title{font-size:13px;font-weight:650;letter-spacing:-.01em}
.lr-chat-status{margin-top:0;font-size:10px;gap:5px}
.lr-pulse-dot{width:7px;height:7px;border-radius:50%;background:var(--lr-accent);flex:0 0 auto;animation:lr-pulse 1.6s ease-out infinite}
.lr-model-pill{padding:0 9px;height:25px;border-color:var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-base) 70%,transparent);font-size:10px}
.lr-chat-scroll{padding:14px 14px 8px;gap:12px}
.lr-chat-scroll.is-empty{justify-content:center}
.lr-overview{border:1px solid var(--lr-line);border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 3%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base));padding:13px;gap:9px;box-shadow:var(--lr-soft-shadow)}
.lr-overview-head{display:flex;align-items:center;gap:8px;min-height:24px;flex-wrap:wrap;row-gap:5px}
.lr-overview-icon{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;background:color-mix(in srgb,var(--lr-accent) 9%,var(--dsw-alias-bg-layer-1));color:var(--lr-accent);flex:0 0 auto}
.lr-overview-title{font-size:12px;font-weight:650;flex:1;letter-spacing:.005em;min-width:60px}
.lr-overview-flag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-success-primary);font-size:8.5px;font-weight:600;white-space:nowrap}
.lr-overview-flag.warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-warn-primary)}
.lr-mini-action.solid{height:24px;padding:0 7px;border:1px solid var(--lr-line);border-radius:7px;background:var(--dsw-alias-bg-base);font-size:9.5px;color:var(--lr-muted)}
.lr-mini-action.solid:hover{border-color:var(--lr-accent);color:var(--lr-accent);background:var(--lr-tint)}
.lr-overview-text{font-size:calc(12.5px * var(--lr-fs,1));line-height:1.68;color:color-mix(in srgb,var(--lr-muted) 72%,var(--lr-ink) 28%)}
.lr-overview-toggle{display:inline-flex;align-items:center;gap:2px;align-self:flex-start;border:0;background:transparent;color:var(--lr-accent);font-family:inherit;font-size:10px;cursor:pointer;padding:0}
.lr-overview-toggle svg{transition:transform .15s ease}
.lr-overview-toggle.expanded svg{transform:rotate(90deg)}
.lr-overview-tags{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;mask-image:linear-gradient(90deg,#000 86%,transparent)}
.lr-overview-tags::-webkit-scrollbar{display:none}
.lr-overview-tags .lr-tag{flex:0 0 auto}
.lr-overview-actions{gap:6px;margin-top:1px}
.lr-overview-actions .lr-btn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.lr-btn.primary.lr-summary-cta{height:30px;font-size:11.5px;border-radius:8px;background:color-mix(in srgb,var(--lr-accent) 9%,transparent);border-color:color-mix(in srgb,var(--lr-accent) 26%,var(--lr-line));color:color-mix(in srgb,var(--lr-accent) 64%,var(--lr-ink));box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent)}
.lr-btn.primary.lr-summary-cta:hover:not(:disabled){background:color-mix(in srgb,var(--lr-accent) 15%,var(--dwp-wash,transparent));border-color:color-mix(in srgb,var(--lr-accent) 42%,var(--lr-line));color:color-mix(in srgb,var(--lr-accent) 50%,var(--lr-ink))}
.lr-tag{height:20px;border-radius:6px;border-color:var(--lr-line);background:var(--dsw-alias-bg-layer-2);color:var(--lr-muted);font-size:9.5px;font-weight:550}
.lr-progress-card{border:1px solid color-mix(in srgb,var(--lr-accent) 18%,var(--lr-line));border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 4%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base));padding:12px 13px;gap:9px;box-shadow:var(--lr-soft-shadow)}
.lr-progress-head{gap:9px}
.lr-progress-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;background:color-mix(in srgb,var(--lr-accent) 10%,var(--dsw-alias-bg-layer-1));color:var(--lr-accent);flex:0 0 auto}
.lr-progress-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lr-progress-title{font-size:11.5px;font-weight:600;line-height:1.4;color:var(--lr-ink)}
.lr-progress-sub{font-size:9.5px;line-height:1.45;color:var(--lr-muted)}
.lr-progress-pct{font-size:10px;font-weight:600;color:var(--lr-accent);font-variant-numeric:tabular-nums}
.lr-progress-track{height:6px;border-radius:99px;background:color-mix(in srgb,var(--lr-accent) 9%,var(--dsw-alias-bg-layer-2));overflow:hidden}
.lr-progress-fill{height:100%;border-radius:99px;background:var(--lr-accent);transition:width .4s ease}
.lr-progress-fill.indeterminate{width:44%!important;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--lr-accent) 45%,transparent),var(--lr-accent),color-mix(in srgb,var(--lr-accent) 45%,transparent),transparent);opacity:.9;animation:lr-sheen 1.8s ease-in-out infinite}
.lr-summary-card{border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 5%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base));padding:11px 12px;box-shadow:var(--lr-soft-shadow)}
.lr-chat-starter{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:22px 16px 18px;border:1px solid var(--lr-line);border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 4%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base));box-shadow:var(--lr-soft-shadow);overflow:hidden}
.lr-starter-icon{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--lr-accent) 20%,var(--dwp-wash,transparent));border:1px solid color-mix(in srgb,var(--lr-accent) 36%,transparent);color:color-mix(in srgb,var(--lr-accent) 50%,var(--lr-ink));box-shadow:0 0 0 4px color-mix(in srgb,var(--lr-accent) 5%,transparent),0 6px 16px color-mix(in srgb,var(--lr-accent) 16%,transparent),inset 0 1px 0 color-mix(in srgb,#fff 20%,transparent)}
.lr-starter-title{font-size:13px;font-weight:650;letter-spacing:-.01em}
.lr-starter-desc{font-size:10.5px;line-height:1.6;color:var(--lr-muted);max-width:240px}
.lr-starter-prompts{display:flex;flex-direction:column;gap:6px;width:100%;margin-top:4px}
.lr-starter-chip{display:flex;align-items:center;gap:7px;width:100%;padding:7px 10px;border:1px solid var(--lr-line);border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 80%,transparent);color:var(--lr-ink);font-family:inherit;font-size:10.5px;text-align:left;cursor:pointer;transition:border-color .15s ease,background .15s ease,transform .15s ease}
.lr-starter-chip svg{color:var(--lr-accent);transform:rotate(45deg);flex:0 0 auto}
.lr-starter-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-starter-chip:hover{border-color:color-mix(in srgb,var(--lr-accent) 40%,var(--lr-line));background:var(--lr-tint);transform:translateX(2px)}
.lr-composer-wrap{padding:10px 14px 11px;border-top:1px solid var(--lr-line);background:linear-gradient(0deg,color-mix(in srgb,var(--lr-accent) 4%,var(--dsw-alias-bg-base)),transparent 90%),var(--dsw-alias-bg-base)}
.lr-quick-row{gap:5px;margin-bottom:8px;align-items:center}
.lr-quick-label{display:inline-flex;align-items:center;gap:4px;font-size:9px;letter-spacing:.06em;font-weight:650;color:var(--lr-muted);margin-right:2px}
.lr-quick-label svg{color:var(--lr-accent)}
.lr-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:7px;border-color:var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-base) 88%,transparent);color:var(--lr-muted);font-size:10px;font-weight:500}
.lr-chip svg{color:color-mix(in srgb,var(--lr-accent) 75%,var(--lr-muted))}
.lr-chip:hover:not(:disabled){border-color:color-mix(in srgb,var(--lr-accent) 35%,var(--lr-line));background:var(--lr-tint);color:var(--lr-accent);transform:translateY(-1px)}
.lr-composer{border-color:var(--lr-line);border-radius:13px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 92%,transparent);padding:8px 9px 6px;box-shadow:var(--lr-soft-shadow);gap:4px}
.lr-composer:focus-within{border-color:color-mix(in srgb,var(--lr-accent) 50%,var(--lr-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--lr-accent) 8%,transparent),var(--lr-soft-shadow)}
.lr-page-context,.lr-selection-context{height:19px;padding:0 6px;border-radius:6px;background:color-mix(in srgb,var(--lr-accent) 5%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--lr-accent) 10%,transparent);font-size:9px;color:var(--lr-muted)}
.lr-textarea{background:transparent;font-size:calc(13px * var(--lr-fs,1));line-height:1.6;color:var(--lr-ink);border:0;outline:0;resize:none;font-family:inherit;min-height:38px;max-height:140px;padding:2px 2px 0}
.lr-send{width:30px;height:30px;border-radius:9px;background:var(--lr-glass-strong);border:1px solid var(--lr-accent-line);color:color-mix(in srgb,var(--lr-accent) 55%,var(--lr-ink));box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 22%,transparent),inset 0 -1px 0 color-mix(in srgb,#000 14%,transparent),0 4px 12px color-mix(in srgb,var(--lr-accent) 14%,transparent);transition:background .15s ease,border-color .15s ease,transform .12s ease}
.lr-send:hover:not(:disabled){background:color-mix(in srgb,var(--lr-accent) 36%,var(--dwp-wash,transparent));border-color:color-mix(in srgb,var(--lr-accent) 68%,var(--dsw-alias-border-l1));transform:translateY(-1px)}
.lr-composer-hint{font-size:8.5px;letter-spacing:.02em}
.lr-msg-avatar{width:18px;height:18px;background:color-mix(in srgb,var(--lr-accent) 20%,var(--dwp-wash,transparent));border:1px solid color-mix(in srgb,var(--lr-accent) 30%,transparent);color:color-mix(in srgb,var(--lr-accent) 55%,var(--lr-ink));font-size:7.5px;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 14%,transparent)}
.lr-msg-role{font-weight:500;letter-spacing:.01em}
.lr-msg.user .lr-msg-body{border-color:color-mix(in srgb,var(--lr-accent) 14%,transparent);background:color-mix(in srgb,var(--lr-accent) 7%,var(--dsw-alias-bg-layer-1));border-radius:12px 12px 4px 12px;padding:8px 10px}
.lr-msg.assistant .lr-msg-body{padding:0 2px}
.lr-cite{background:color-mix(in srgb,var(--lr-accent) 9%,var(--dsw-alias-bg-layer-1));font-weight:500}
.lr-warning-card{border-radius:12px}
.lr-library{background:radial-gradient(1000px 420px at 92% -16%,color-mix(in srgb,var(--lr-accent) 12%,transparent),transparent 62%),radial-gradient(700px 340px at -8% 108%,color-mix(in srgb,var(--lr-accent) 6%,transparent),transparent 60%),var(--dsw-alias-bg-base)}
.lr-library-head{padding:18px 22px 15px;border-bottom:1px solid var(--lr-line);background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 4%,var(--dsw-alias-bg-base)),transparent)}
.lr-library-title-block{gap:2px}
.lr-library-kicker{font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:color-mix(in srgb,var(--lr-accent) 62%,var(--lr-muted));font-weight:700}
.lr-library-title{position:relative;width:fit-content;padding-bottom:5px;font-size:23px;font-weight:700;letter-spacing:-.03em}
.lr-library-title:after{content:"";position:absolute;left:0;bottom:0;width:24px;height:2px;border-radius:99px;background:var(--lr-accent);opacity:.75}
.lr-library-path{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:2px;font-size:10px;color:var(--lr-muted)}
.lr-stat-chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--lr-muted);font-size:9px;font-variant-numeric:tabular-nums;font-weight:500;white-space:nowrap}
.lr-stat-chip.accent{background:color-mix(in srgb,var(--lr-accent) 9%,var(--dsw-alias-bg-layer-1));color:var(--lr-accent)}
.lr-stat-chip.warm{background:color-mix(in srgb,#eab308 11%,var(--dsw-alias-bg-layer-1));color:var(--lr-warm)}
.lr-library-actions{gap:8px}
.lr-folder-pane{background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 3%,var(--dsw-alias-bg-layer-1)),var(--dsw-alias-bg-layer-1) 160px);padding:12px 9px 22px;border-right-color:var(--lr-line)}
.lr-folder-kicker{padding:1px 9px 9px;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--lr-muted);font-weight:700}
.lr-folder-row{height:32px;border-radius:9px}
.lr-folder-row svg{color:color-mix(in srgb,#b45309 58%,var(--lr-muted));opacity:.9}
.lr-folder-row:hover{background:color-mix(in srgb,var(--lr-accent) 6%,var(--dsw-alias-bg-layer-1))}
.lr-folder-row.active{background:color-mix(in srgb,var(--lr-accent) 11%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--lr-accent) 22%,transparent);color:var(--lr-accent);box-shadow:inset 2px 0 0 var(--lr-accent)}
.lr-folder-row.root svg{color:var(--lr-accent)}
.lr-folder-count{font-weight:500}
.lr-library-main{padding:16px 20px 44px}
.lr-library-tabs{padding:3px;border-radius:10px;border-color:var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-base) 70%,transparent)}
.lr-library-tab{height:29px;border-radius:7px;font-weight:500}
.lr-library-tab svg{color:var(--lr-muted)}
.lr-library-tab.active{background:color-mix(in srgb,var(--lr-accent) 13%,var(--dwp-wash,transparent));color:color-mix(in srgb,var(--lr-accent) 58%,var(--lr-ink));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lr-accent) 30%,transparent),inset 0 1px 0 color-mix(in srgb,#fff 12%,transparent)}
.lr-library-tab.active svg{color:inherit}
.lr-library-tab.active span{background:color-mix(in srgb,var(--lr-accent) 18%,transparent);color:inherit}
.lr-library-search{height:36px;border-radius:10px;border-color:var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-base) 80%,transparent)}
.lr-library-search:focus-within{border-color:color-mix(in srgb,var(--lr-accent) 45%,var(--lr-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--lr-accent) 7%,transparent)}
.lr-library-breadcrumb{margin-top:14px}
.lr-pdf-grid{gap:14px;margin-top:16px}
.lr-pdf-card{position:relative;border-radius:15px;padding:14px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 92%,transparent);border-color:var(--lr-line);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.lr-pdf-card:hover{transform:translateY(-2px);box-shadow:var(--lr-shadow);border-color:color-mix(in srgb,var(--lr-accent) 28%,var(--lr-line))}
.lr-pdf-card:before{content:"";position:absolute;left:14px;right:14px;top:0;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,var(--lr-accent),transparent);opacity:.35}
.lr-pdf-card.ok:before{background:linear-gradient(90deg,var(--dsw-alias-state-success-primary),transparent)}
.lr-pdf-card.warn:before{background:linear-gradient(90deg,var(--dsw-alias-state-warn-primary),transparent)}
.lr-pdf-card.bad:before{background:linear-gradient(90deg,var(--dsw-alias-state-error-primary),transparent)}
.lr-pdf-card.idle:before{background:linear-gradient(90deg,var(--lr-muted),transparent)}
.lr-pdf-icon{width:32px;height:32px;border-radius:10px;background:color-mix(in srgb,var(--lr-accent) 9%,var(--dsw-alias-bg-layer-1));color:var(--lr-accent)}
.lr-pdf-card.ok .lr-pdf-icon{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-success-primary)}
.lr-pdf-card.warn .lr-pdf-icon{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 11%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-warn-primary)}
.lr-pdf-card.bad .lr-pdf-icon{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary)}
.lr-pdf-card-top{gap:8px}
.lr-status-pill{height:21px;border-radius:6px;font-weight:500}
.lr-summary-pill{height:20px;font-weight:600}
.lr-pdf-title{font-size:13.5px;font-weight:650;line-height:1.45;letter-spacing:-.005em;text-wrap:pretty}
.lr-pdf-path{margin-top:1px}
.lr-note-link{height:24px;border-style:solid;border-color:var(--lr-line);background:color-mix(in srgb,var(--lr-accent) 3%,var(--dsw-alias-bg-base));border-radius:6px;font-size:9.5px}
.lr-note-link:hover{border-color:color-mix(in srgb,var(--lr-accent) 40%,var(--lr-line));color:var(--lr-accent);background:var(--lr-tint)}
.lr-pdf-footer{padding-top:6px}
.lr-note-list{gap:9px;margin-top:16px}
.lr-note-card{border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 92%,transparent);border-color:var(--lr-line);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.lr-note-card:hover{transform:translateY(-1px);box-shadow:var(--lr-soft-shadow);border-color:color-mix(in srgb,var(--lr-accent) 25%,var(--lr-line))}
.lr-note-card .lr-note-title-row svg{color:var(--lr-accent)}
.lr-library-empty{border-radius:14px;background:color-mix(in srgb,var(--lr-accent) 2%,var(--dsw-alias-bg-base))}
.lr-empty{background:radial-gradient(620px 300px at 30% 10%,color-mix(in srgb,var(--lr-accent) 10%,transparent),transparent 60%),radial-gradient(520px 280px at 80% 100%,color-mix(in srgb,var(--lr-accent) 5%,transparent),transparent 65%),var(--dsw-alias-bg-base)}
.lr-empty-card{border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--lr-accent) 3%,var(--dsw-alias-bg-base)),color-mix(in srgb,var(--dsw-alias-bg-layer-1) 70%,transparent));box-shadow:var(--lr-shadow)}
.lr-empty-icon{background:color-mix(in srgb,var(--lr-accent) 18%,var(--dwp-wash,transparent));color:color-mix(in srgb,var(--lr-accent) 52%,var(--lr-ink));border:1px solid color-mix(in srgb,var(--lr-accent) 36%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 18%,transparent),0 8px 24px color-mix(in srgb,var(--lr-accent) 14%,transparent)}
.lr-empty-title{font-size:24px;font-weight:700;letter-spacing:-.025em;text-wrap:balance}
.lr-empty-desc{color:var(--lr-muted)}
.lr-feature{border-radius:12px;border-color:var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-base) 86%,transparent);transition:transform .18s ease,border-color .18s ease}
.lr-feature:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--lr-accent) 26%,var(--lr-line))}
.lr-feature-icon{background:color-mix(in srgb,var(--lr-accent) 9%,var(--dsw-alias-bg-layer-1));color:var(--lr-accent)}
.lr-feature:nth-child(2) .lr-feature-icon{background:var(--lr-warm-soft);color:var(--lr-warm)}
.lr-feature:nth-child(3) .lr-feature-icon{background:var(--lr-rose-soft);color:var(--lr-rose)}
/* Library interactions: drag-to-move, folder actions, destructive confirmation. */
.lr-folder-row{position:relative;gap:0;padding:0 4px 0 0;cursor:default;color:var(--lr-muted)}
.lr-folder-main{display:flex;align-items:center;gap:6px;flex:1;min-width:0;height:100%;padding:0 8px;border:0;background:transparent;color:inherit;font-family:inherit;font-size:11.5px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden}
.lr-folder-main .lr-folder-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.lr-folder-row.root .lr-folder-main{font-weight:600}
.lr-folder-actions{display:flex;align-items:center;gap:1px;padding-right:3px;flex:0 0 auto;opacity:0;pointer-events:none;transition:opacity .12s ease}
.lr-folder-row:hover .lr-folder-actions,.lr-folder-row:focus-within .lr-folder-actions{opacity:1;pointer-events:auto}
.lr-folder-action{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--lr-muted);cursor:pointer}
.lr-folder-action svg{color:inherit;opacity:1}
.lr-folder-action:hover{background:var(--lr-tint);color:var(--lr-ink)}
.lr-folder-action.danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.lr-folder-row.drop-target{background:color-mix(in srgb,var(--lr-accent) 20%,var(--dwp-wash,transparent));border-color:color-mix(in srgb,var(--lr-accent) 45%,var(--dsw-alias-border-l1));box-shadow:inset 2px 0 0 var(--lr-accent)}
.lr-folder-row.drop-target .lr-folder-name{color:var(--lr-ink)}
.lr-folder-row.drop-target .lr-folder-actions{opacity:0;pointer-events:none}
.lr-library-main.drop-target-root{outline:2px dashed color-mix(in srgb,var(--lr-accent) 55%,transparent);outline-offset:-6px;border-radius:10px;background:color-mix(in srgb,var(--lr-accent) 6%,transparent)}
@media (hover:none){.lr-folder-actions{opacity:1;pointer-events:auto}}
.lr-pdf-card[draggable=true],.lr-note-card[draggable=true]{cursor:grab}
.lr-pdf-card.is-dragging,.lr-note-card.is-dragging{opacity:.55;border-style:dashed;transform:none}
.lr-card-actions{display:flex;align-items:center;gap:1px;margin-left:auto;flex:0 0 auto}
.lr-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--lr-muted);opacity:.55;cursor:grab}
.lr-pdf-card:hover .lr-drag-handle,.lr-note-card:hover .lr-drag-handle{opacity:1;color:var(--lr-accent)}
.lr-card-action{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--lr-muted);cursor:pointer}
.lr-card-action:hover{background:var(--lr-tint);color:var(--lr-ink)}
.lr-card-action.danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.lr-note-actions{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.lr-btn.danger{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 38%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.lr-btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 20%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary)}
.lr-delete-dialog{display:flex;flex-direction:column;gap:11px}
.lr-delete-warning{display:flex;align-items:flex-start;gap:8px;padding:10px 11px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 24%,var(--lr-line));border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,var(--dsw-alias-bg-base))}
.lr-delete-warning svg{flex:0 0 auto;color:var(--dsw-alias-state-error-primary);margin-top:1px}
.lr-delete-warning-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
.lr-delete-warning-title{font-size:12px;font-weight:600;line-height:1.5;color:var(--lr-ink)}
.lr-delete-warning-text{font-size:10.5px;line-height:1.55;color:var(--lr-muted)}
.lr-delete-path{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--lr-muted);padding:0 2px;overflow-wrap:anywhere}
.lr-delete-path svg{flex:0 0 auto}
.lr-delete-counts{display:flex;gap:6px;flex-wrap:wrap}
.lr-related-notes{display:flex;flex-direction:column;gap:7px;padding:9px 10px;border:1px solid var(--lr-line);border-radius:10px;background:color-mix(in srgb,var(--lr-accent) 3%,var(--dsw-alias-bg-base))}
.lr-related-notes-title{font-size:10.5px;font-weight:600;color:var(--lr-ink);letter-spacing:.01em}
.lr-related-list{display:flex;flex-direction:column;gap:3px;max-height:110px;overflow:auto}
.lr-related-note{display:flex;align-items:center;gap:5px;min-width:0;font-size:10px;color:var(--lr-muted)}
.lr-related-note svg{flex:0 0 auto;color:var(--lr-accent)}
.lr-related-note span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-related-toggle{gap:7px;white-space:normal;font-size:10.5px;color:var(--lr-ink)}
.lr-related-toggle input{width:15px;height:15px;min-width:15px;padding:0;margin:0;flex:0 0 auto}
.lr-delete-hint{font-size:9.5px;line-height:1.5;color:var(--lr-muted)}
.lr-modal{border-radius:18px;border-color:var(--lr-line);box-shadow:0 30px 90px color-mix(in srgb,var(--lr-accent) 16%,rgba(15,23,42,.5))}
.lr-modal-head{padding:15px 18px;border-bottom-color:var(--lr-line);background:linear-gradient(180deg,var(--lr-tint),transparent)}
.lr-modal-title{font-size:15px;font-weight:650;letter-spacing:-.01em}
.lr-modal-subtitle{color:var(--lr-muted)}
.lr-modal-body{padding:20px 24px 28px}
.lr-modal-backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 42%,transparent);backdrop-filter:blur(3px)}
.lr-toast{border-radius:12px;border-color:var(--lr-line);box-shadow:var(--lr-shadow)}
.lr-import-icon{background:color-mix(in srgb,var(--lr-accent) 18%,var(--dwp-wash,transparent));color:color-mix(in srgb,var(--lr-accent) 52%,var(--lr-ink));border:1px solid color-mix(in srgb,var(--lr-accent) 36%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 18%,transparent),0 6px 18px color-mix(in srgb,var(--lr-accent) 14%,transparent)}
.lr-boot{color:var(--lr-muted)}
@keyframes lr-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--lr-accent) 38%,transparent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes lr-sheen{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
@media (prefers-reduced-motion:reduce){
.lr-root *,.lr-root *:before,.lr-root *:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
@keyframes lr-spin{to{transform:rotate(360deg)}}
@keyframes lr-fade{from{opacity:0}to{opacity:1}}
@keyframes lr-pop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
@keyframes lr-slide-in{from{transform:translateX(-14px);opacity:.4}to{transform:none;opacity:1}}
@keyframes lr-toast-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes lr-indeterminate{0%{transform:translateX(-110%)}50%{transform:translateX(120%)}100%{transform:translateX(300%)}}
@keyframes lr-blink{0%,45%{opacity:1}50%,100%{opacity:0}}
@media(max-width:1400px){.lr-model-pill{max-width:170px;font-size:9.5px;padding:0 7px}.lr-chat-title-row{gap:4px}.lr-model-box{gap:0}}
@media(max-width:1200px){.lr-drag-hint{display:none}}
@media(max-width:1100px){.lr-label{display:none}.lr-header-actions .lr-btn{padding:0 8px}.lr-title{max-width:38vw}.lr-model-pill{max-width:150px;padding:0 6px;gap:3px}.lr-model-pill-label{flex:0 1 auto}.lr-folder-pane{flex-basis:204px;width:204px}.lr-pdf-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}.lr-library-sync{display:none}.lr-library-main{padding:12px 14px 30px}}
@media(max-width:860px){.lr-library-head{flex-wrap:wrap;gap:8px}.lr-library-actions{width:100%;justify-content:flex-end}.lr-library-body{flex-direction:column}.lr-folder-pane{flex:0 0 auto;width:100%;max-height:150px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.lr-pdf-grid{grid-template-columns:1fr}.lr-library-main{padding:12px 12px 30px}.lr-library-sync{display:none}}
@media(max-width:980px){.lr-subtitle{max-width:32vw}.lr-tool span{display:none}.lr-tool{padding:0 7px}.lr-feature-grid{grid-template-columns:1fr}.lr-empty-title{font-size:20px}.lr-width-control span:first-child{display:none}}
@media(max-width:860px){.lr-split{display:flex;flex-direction:column}.lr-viewer{flex:1 1 auto;width:100%;min-width:0;min-height:0}.lr-chat{flex:0 0 42%;min-width:0;border-top:1px solid var(--dsw-alias-border-l1)}.lr-divider{display:none}.lr-chat-scroll{max-height:none}.lr-title{max-width:46vw}}

/* ── Summary view ───────────────────────────────────────────────────────── */
.lr-note{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:calc(12px * var(--lr-fs,1))}
.lr-note-loading{display:flex;flex:1;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-secondary);font-size:12px}
.lr-note-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 82%,var(--dsw-alias-bg-base));backdrop-filter:blur(10px)}
.lr-note-back{flex:0 0 auto;height:26px;font-size:11.5px;gap:3px}
.lr-note-head-title{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 200px}
.lr-note-head-name{font-size:12.5px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-note-head-meta{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-note-head-kind{color:color-mix(in srgb,var(--lr-accent) 62%,var(--dsw-alias-label-secondary));font-weight:600;letter-spacing:.01em}
.lr-note-tabs{display:flex;align-items:center;gap:2px;padding:2px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 7%,transparent);border:1px solid var(--lr-line);flex:0 0 auto}
.lr-note-tab{display:inline-flex;align-items:center;gap:5px;height:23px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap;transition:background .14s ease,color .14s ease}
.lr-note-tab:hover{color:var(--dsw-alias-label-primary)}
.lr-note-tab.active{background:var(--dsw-alias-bg-base);color:var(--lr-ink,var(--dsw-alias-label-primary));font-weight:600;box-shadow:0 1px 3px color-mix(in srgb,#000 12%,transparent)}
.lr-note-tab svg{width:12px;height:12px}
.lr-note-save-state{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:0 0 auto}
.lr-note-save-state.unsaved{color:var(--dsw-alias-state-warn-primary,var(--lr-warm,var(--dsw-alias-label-secondary)))}
.lr-note-save-state.saving{color:color-mix(in srgb,var(--lr-accent) 70%,var(--dsw-alias-label-secondary))}
.lr-note-save-state.error{color:var(--dsw-alias-state-error-primary)}
.lr-note-head-actions{display:flex;align-items:center;gap:5px;margin-left:auto;flex:0 0 auto}
.lr-note-more{position:relative}
.lr-note-more-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:40;display:flex;flex-direction:column;min-width:168px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 14px 34px color-mix(in srgb,#000 22%,transparent)}
.lr-note-more-item{display:flex;align-items:center;gap:7px;height:28px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px;text-align:left;cursor:pointer}
.lr-note-more-item:hover{background:var(--dsw-alias-bg-layer-2)}
.lr-note-panel-toggle{position:relative}
.lr-note-panel-toggle.active{background:color-mix(in srgb,var(--lr-accent) 14%,transparent);border-color:color-mix(in srgb,var(--lr-accent) 34%,var(--lr-line))}
.lr-note-panel-count{position:absolute;top:-4px;right:-4px;min-width:14px;height:14px;padding:0 3px;border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);font-size:8.5px;line-height:14px;text-align:center;font-weight:600}
.lr-note-banner{display:flex;align-items:center;gap:8px;padding:7px 14px;font-size:11.5px;border-bottom:1px solid var(--lr-line)}
.lr-note-banner.warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c98a00) 10%,transparent);color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c98a00) 78%,var(--dsw-alias-label-primary))}
.lr-note-banner.conflict{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent);color:var(--dsw-alias-label-primary);flex-wrap:wrap}
.lr-note-banner.vault{background:color-mix(in srgb,var(--lr-warm,#e2a03f) 13%,transparent);color:color-mix(in srgb,var(--dsw-alias-label-primary) 92%,var(--lr-warm,#e2a03f));flex-wrap:wrap;border-bottom-color:color-mix(in srgb,var(--lr-warm,#e2a03f) 30%,var(--lr-line))}
.lr-note-banner.vault .lr-btn{flex:0 0 auto}
.lr-note-vault-missing{display:flex;align-items:center;gap:10px;padding:28px 22px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.lr-note-banner span{flex:1 1 auto;min-width:120px;line-height:1.45}
.lr-note-banner-close{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;opacity:.7}
.lr-note-banner-close:hover{opacity:1;background:color-mix(in srgb,currentColor 12%,transparent)}
.lr-note-stage{display:flex;flex:1;min-height:0;min-width:0}
.lr-note-scroll{position:relative;flex:1;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;scroll-behavior:smooth;background:radial-gradient(circle at 50% 0,color-mix(in srgb,var(--lr-accent) 5%,transparent),transparent 420px),var(--dsw-alias-bg-base)}
.lr-note-paper-wrap{position:relative;max-width:820px;margin:0 auto;padding:22px 26px 90px}
.lr-note-paper{font-size:calc(12.5px * var(--lr-fs,1));line-height:1.78;color:var(--dsw-alias-label-primary);word-break:break-word}
.lr-note-paper-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:70px 20px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}
.lr-note-paper-empty-hint{max-width:420px;font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}
.lr-note-empty{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:60px 24px;text-align:center}
.lr-note-empty-icon{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:color-mix(in srgb,var(--lr-accent) 10%,transparent);color:color-mix(in srgb,var(--lr-accent) 70%,var(--dsw-alias-label-secondary))}
.lr-note-empty-title{font-size:14px;font-weight:600}
.lr-note-empty-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary);max-width:420px;line-height:1.6}
.lr-note-empty-actions{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;justify-content:center}
/* Rendered Markdown */
.lr-note-doc>*:first-child{margin-top:0}
.lr-note-doc>*:last-child{margin-bottom:0}
.lr-note-h{margin:26px 0 10px;line-height:1.32;font-weight:650;letter-spacing:-.01em;scroll-margin-top:16px}
.lr-note-h1{font-size:calc(20px * var(--lr-fs,1));padding-bottom:7px;border-bottom:1px solid var(--lr-line)}
.lr-note-h2{font-size:calc(16px * var(--lr-fs,1))}
.lr-note-h3{font-size:calc(14px * var(--lr-fs,1))}
.lr-note-h4{font-size:calc(12.5px * var(--lr-fs,1))}
.lr-note-p{margin:10px 0;line-height:1.78}
.lr-note-p-pending{position:relative}
.lr-note-figure-flag{margin-right:5px;color:color-mix(in srgb,var(--lr-accent) 70%,var(--dsw-alias-label-secondary))}
.lr-note-doc-list{margin:10px 0;padding-left:22px;display:flex;flex-direction:column;gap:4px}
.lr-note-doc-list li{line-height:1.7}
.lr-note-quote{margin:12px 0;padding:2px 0 2px 14px;border-left:2.5px solid color-mix(in srgb,var(--lr-accent) 34%,var(--lr-line));color:color-mix(in srgb,var(--dsw-alias-label-primary) 82%,var(--dsw-alias-label-secondary))}
.lr-note-quote-body>*:first-child{margin-top:0}
.lr-note-quote-body>*:last-child{margin-bottom:0}
.lr-note-callout{margin:14px 0;padding:10px 12px;border:1px solid var(--lr-line);border-left:3px solid var(--lr-accent);border-radius:9px;background:color-mix(in srgb,var(--lr-accent) 5%,var(--dsw-alias-bg-layer-1))}
.lr-note-callout-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;font-weight:650;color:color-mix(in srgb,var(--lr-accent) 62%,var(--dsw-alias-label-primary));letter-spacing:.01em}
.lr-note-callout-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr-note-callout-body>*:first-child{margin-top:0}
.lr-note-callout-body>*:last-child{margin-bottom:0}
.lr-note-callout-warning,.lr-note-callout-danger,.lr-note-callout-caution,.lr-note-callout-bug{border-left-color:var(--dsw-alias-state-warn-primary,#c98a00);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c98a00) 6%,var(--dsw-alias-bg-layer-1))}
.lr-note-callout-warning .lr-note-callout-head,.lr-note-callout-danger .lr-note-callout-head,.lr-note-callout-caution .lr-note-callout-head,.lr-note-callout-bug .lr-note-callout-head{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c98a00) 80%,var(--dsw-alias-label-primary))}
.lr-note-callout-tip,.lr-note-callout-success,.lr-note-callout-check,.lr-note-callout-done{border-left-color:var(--lr-teal,var(--lr-accent));background:color-mix(in srgb,var(--lr-teal,var(--lr-accent)) 6%,var(--dsw-alias-bg-layer-1))}
.lr-note-callout-tip .lr-note-callout-head,.lr-note-callout-success .lr-note-callout-head,.lr-note-callout-check .lr-note-callout-head,.lr-note-callout-done .lr-note-callout-head{color:color-mix(in srgb,var(--lr-teal,var(--lr-accent)) 74%,var(--dsw-alias-label-primary))}
.lr-note-callout-question,.lr-note-callout-faq,.lr-note-callout-help{border-left-color:var(--lr-rose,var(--lr-accent));background:color-mix(in srgb,var(--lr-rose,var(--lr-accent)) 6%,var(--dsw-alias-bg-layer-1))}
.lr-note-callout-question .lr-note-callout-head,.lr-note-callout-faq .lr-note-callout-head,.lr-note-callout-help .lr-note-callout-head{color:color-mix(in srgb,var(--lr-rose,var(--lr-accent)) 74%,var(--dsw-alias-label-primary))}
.lr-note-hr{margin:22px 0;border:0;border-top:1px solid var(--lr-line)}
.lr-note-pre{margin:12px 0;padding:11px 13px;border:1px solid var(--lr-line);border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1));overflow-x:auto;font-size:calc(11px * var(--lr-fs,1));line-height:1.62}
.lr-note-pre code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}
.lr-note-inline-code{padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
.lr-note-table-wrap{margin:14px 0;overflow-x:auto;border:1px solid var(--lr-line);border-radius:9px}
.lr-note-table{width:100%;border-collapse:collapse;font-size:calc(11.5px * var(--lr-fs,1))}
.lr-note-table th,.lr-note-table td{padding:6px 10px;border-bottom:1px solid var(--lr-line);text-align:left;vertical-align:top;line-height:1.6}
.lr-note-table th{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);font-weight:600;white-space:nowrap}
.lr-note-table tr:last-child td{border-bottom:0}
.lr-note-figure{margin:16px 0;display:flex;flex-direction:column;align-items:center;gap:7px}
.lr-note-figure img{max-width:100%;border:1px solid var(--lr-line);border-radius:9px;background:var(--dsw-alias-bg-layer-1);cursor:zoom-in;transition:border-color .15s ease,transform .15s ease}
.lr-note-figure img:hover{border-color:color-mix(in srgb,var(--lr-accent) 44%,var(--lr-line));transform:translateY(-1px)}
.lr-note-figure figcaption{font-size:10.5px;color:var(--dsw-alias-label-secondary);text-align:center;line-height:1.55}
.lr-note-doc-link{color:color-mix(in srgb,var(--lr-accent) 76%,var(--dsw-alias-label-primary));text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px;cursor:pointer}
.lr-note-doc-link:hover{color:color-mix(in srgb,var(--lr-accent) 92%,var(--dsw-alias-label-primary))}
.lr-note-cite{display:inline-flex;align-items:center;height:16px;padding:0 5px;margin:0 1px;border:1px solid color-mix(in srgb,var(--lr-accent) 26%,var(--lr-line));border-radius:5px;background:color-mix(in srgb,var(--lr-accent) 8%,transparent);color:color-mix(in srgb,var(--lr-accent) 72%,var(--dsw-alias-label-secondary));font-family:inherit;font-size:9.5px;font-weight:600;line-height:1;vertical-align:1px;cursor:pointer;transition:background .14s ease}
.lr-note-cite:hover{background:color-mix(in srgb,var(--lr-accent) 18%,transparent);border-color:color-mix(in srgb,var(--lr-accent) 42%,var(--lr-line))}
/* Annotation highlights */
.lr-note-t{white-space:pre-wrap}
.lr-ann-mark{border-radius:3px;padding:1px 0;color:inherit;background:transparent;cursor:pointer;box-decoration-break:clone;-webkit-box-decoration-break:clone;transition:background .14s ease}
.lr-ann-mark.lr-ann-amber{background:color-mix(in srgb,var(--lr-warm,#e2a03f) 24%,transparent);box-shadow:inset 0 -1.5px 0 color-mix(in srgb,var(--lr-warm,#e2a03f) 52%,transparent)}
.lr-ann-mark.lr-ann-rose{background:color-mix(in srgb,var(--lr-rose,#dd5f7d) 22%,transparent);box-shadow:inset 0 -1.5px 0 color-mix(in srgb,var(--lr-rose,#dd5f7d) 50%,transparent)}
.lr-ann-mark.lr-ann-sky{background:color-mix(in srgb,var(--lr-accent,#4c8dd8) 22%,transparent);box-shadow:inset 0 -1.5px 0 color-mix(in srgb,var(--lr-accent,#4c8dd8) 50%,transparent)}
.lr-ann-mark.lr-ann-mint{background:color-mix(in srgb,var(--lr-teal,#3aa88f) 24%,transparent);box-shadow:inset 0 -1.5px 0 color-mix(in srgb,var(--lr-teal,#3aa88f) 52%,transparent)}
.lr-ann-mark:hover{filter:brightness(1.05);background:color-mix(in srgb,currentColor 14%,transparent)}
.lr-ann-mark.is-resolved{opacity:.55;background:transparent;box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--dsw-alias-label-secondary) 40%,transparent)}
.lr-ann-mark.is-orphan{opacity:.4;background:transparent;box-shadow:none}
.lr-ann-seq{display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;margin:0 1px 0 2px;border-radius:7px;color:#fff;font-size:8.5px;font-weight:700;line-height:1;vertical-align:3px;cursor:pointer;user-select:none}
.lr-ann-seq-amber{background:color-mix(in srgb,var(--lr-warm,#e2a03f) 92%,#000)}
.lr-ann-seq-rose{background:color-mix(in srgb,var(--lr-rose,#dd5f7d) 92%,#000)}
.lr-ann-seq-sky{background:color-mix(in srgb,var(--lr-accent,#4c8dd8) 92%,#000)}
.lr-ann-seq-mint{background:color-mix(in srgb,var(--lr-teal,#3aa88f) 92%,#000)}
/* Floating selection toolbar */
.lr-ann-toolbar{position:absolute;z-index:30;display:flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 26px color-mix(in srgb,#000 20%,transparent);transform:translateX(-50%);animation:lr-pop .14s ease}
.lr-ann-toolbar-btn{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11px;font-weight:550;cursor:pointer;white-space:nowrap}
.lr-ann-toolbar-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.lr-ann-toolbar-btn.primary{background:color-mix(in srgb,var(--lr-accent) 16%,transparent);color:color-mix(in srgb,var(--lr-accent) 78%,var(--dsw-alias-label-primary))}
.lr-ann-toolbar-btn.primary:hover{background:color-mix(in srgb,var(--lr-accent) 26%,transparent)}
.lr-ann-toolbar-close{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.lr-ann-toolbar-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
/* Annotation dialog */
.lr-ann-dialog{display:flex;flex-direction:column;gap:10px}
.lr-ann-quote-box{padding:8px 10px;border-left:2.5px solid color-mix(in srgb,var(--lr-accent) 40%,var(--lr-line));border-radius:0 7px 7px 0;background:color-mix(in srgb,var(--lr-accent) 6%,var(--dsw-alias-bg-layer-1));font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);max-height:96px;overflow-y:auto}
.lr-ann-input{width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1.65;resize:vertical;min-height:74px}
.lr-ann-input:focus{outline:2px solid color-mix(in srgb,var(--lr-accent) 40%,transparent);outline-offset:1px;border-color:color-mix(in srgb,var(--lr-accent) 40%,var(--dsw-alias-border-l1))}
.lr-ann-dialog-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lr-ann-label{font-size:11px;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.lr-ann-colors{display:inline-flex;align-items:center;gap:5px}
.lr-ann-color{width:20px;height:20px;padding:0;border:1.5px solid transparent;border-radius:50%;cursor:pointer;transition:transform .12s ease,border-color .12s ease;position:relative}
.lr-ann-color:hover{transform:scale(1.1)}
.lr-ann-color.active{border-color:var(--dsw-alias-label-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-base) inset}
.lr-ann-color-amber{background:color-mix(in srgb,var(--lr-warm,#e2a03f) 82%,#fff)}
.lr-ann-color-rose{background:color-mix(in srgb,var(--lr-rose,#dd5f7d) 82%,#fff)}
.lr-ann-color-sky{background:color-mix(in srgb,var(--lr-accent,#4c8dd8) 82%,#fff)}
.lr-ann-color-mint{background:color-mix(in srgb,var(--lr-teal,#3aa88f) 82%,#fff)}
.lr-ann-reply{padding:7px 9px;border-radius:7px;background:color-mix(in srgb,var(--lr-teal,var(--lr-accent)) 8%,transparent);font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.lr-ann-error{padding:6px 9px;border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.5}
.lr-ann-dialog-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.lr-ann-spacer{flex:1 1 auto}
.lr-ann-hint{font-size:10px;color:var(--dsw-alias-label-secondary);text-align:right}
/* Annotation rail */
.lr-ann-panel{display:none;flex:0 0 300px;width:300px;min-width:0;flex-direction:column;border-left:1px solid var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,var(--dsw-alias-bg-base))}
.lr-ann-panel.open{display:flex}
.lr-ann-panel-scrim{display:none}
@media(max-width:1100px){.lr-note-stage.panel-open .lr-ann-panel-scrim{display:block;position:absolute;inset:0;z-index:19;background:color-mix(in srgb,#000 26%,transparent);animation:lr-fade .14s ease}}
.lr-ann-panel-head{display:flex;align-items:center;gap:6px;padding:9px 10px;border-bottom:1px solid var(--lr-line);color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.lr-ann-panel-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lr-ann-panel-title{flex:1 1 auto;min-width:0;font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-ann-panel-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:6px}
.lr-ann-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:36px 18px;color:var(--dsw-alias-label-secondary);font-size:11px;text-align:center;line-height:1.6}
.lr-ann-empty-hint{font-size:10px;opacity:.8;max-width:200px;line-height:1.6}
.lr-ann-group{margin-bottom:6px}
.lr-ann-group-head{display:flex;align-items:center;gap:5px;width:100%;padding:5px 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:10.5px;font-weight:600;letter-spacing:.02em;cursor:pointer}
.lr-ann-group-head:hover{background:var(--dsw-alias-bg-layer-2)}
.lr-ann-group-head svg{transition:transform .14s ease}
.lr-ann-group:not(.collapsed) .lr-ann-group-head svg{transform:rotate(90deg)}
.lr-ann-group-count{margin-left:auto;padding:0 5px;height:15px;line-height:15px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 14%,transparent);font-size:9px;font-weight:600}
.lr-ann-group-body{display:flex;flex-direction:column;gap:4px;padding:2px 0 4px}
.lr-ann-item{display:flex;align-items:flex-start;gap:7px;padding:7px 8px;border:1px solid transparent;border-radius:8px;transition:background .14s ease,border-color .14s ease}
.lr-ann-item:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--lr-line)}
.lr-ann-item.is-resolved,.lr-ann-item.lr-ann-item-resolved{opacity:.62}
.lr-ann-item.lr-ann-item-orphan{opacity:.5}
.lr-ann-badge{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;color:#fff;font-size:9px;font-weight:700;line-height:1;margin-top:2px}
.lr-ann-item-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}
.lr-ann-item-quote{padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:10.5px;line-height:1.5;text-align:left;cursor:pointer;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.lr-ann-item-quote:hover{color:color-mix(in srgb,var(--lr-accent) 70%,var(--dsw-alias-label-primary))}
.lr-ann-item-note{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-primary);word-break:break-word}
.lr-ann-item-reply{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-secondary);font-style:italic}
.lr-ann-item-actions{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;opacity:.55;transition:opacity .14s ease}
.lr-ann-item:hover .lr-ann-item-actions,.lr-ann-item:focus-within .lr-ann-item-actions{opacity:1}
.lr-ann-item-actions .lr-btn.icon.small{width:20px;height:20px}
/* Apply bar */
.lr-note-applybar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 14px;border-top:1px solid var(--lr-line);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 86%,var(--dsw-alias-bg-base));backdrop-filter:blur(10px);flex:0 0 auto}
.lr-note-applybar.running{background:color-mix(in srgb,var(--lr-accent) 8%,var(--dsw-alias-bg-layer-1))}
.lr-note-applybar-info{display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0;flex-wrap:wrap}
.lr-note-applybar-count{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border:1px solid color-mix(in srgb,var(--lr-accent) 24%,var(--lr-line));border-radius:7px;background:color-mix(in srgb,var(--lr-accent) 8%,transparent);color:color-mix(in srgb,var(--lr-accent) 70%,var(--dsw-alias-label-primary));font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.lr-note-applybar-count:hover{background:color-mix(in srgb,var(--lr-accent) 15%,transparent)}
.lr-note-applybar-hint{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.lr-note-applybar-warn{font-size:10px;color:var(--dsw-alias-state-warn-primary,#c98a00);white-space:nowrap}
.lr-note-applybar-input{flex:1 1 200px;min-width:120px;height:28px;padding:0 10px;border:1px solid var(--lr-line);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px}
.lr-note-applybar-input:focus{outline:2px solid color-mix(in srgb,var(--lr-accent) 38%,transparent);outline-offset:1px;border-color:color-mix(in srgb,var(--lr-accent) 38%,var(--lr-line))}
.lr-note-applybar-input:disabled{opacity:.55}
.lr-note-apply-btn{flex:0 0 auto;height:28px;font-size:11.5px;gap:5px}
/* Editor */
.lr-note-editor{display:flex;flex-direction:column;gap:8px;min-height:0}
.lr-note-editor-bar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;position:sticky;top:-22px;z-index:5;padding:7px 0;background:color-mix(in srgb,var(--dsw-alias-bg-base) 92%,transparent);backdrop-filter:blur(8px)}
.lr-note-editor-words{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.lr-note-editor-hint{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.lr-note-draft-banner{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c98a00) 30%,var(--lr-line));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c98a00) 8%,transparent);font-size:11px;color:var(--dsw-alias-label-primary)}
.lr-note-editor-error{padding:6px 10px;border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:11px}
.lr-note-editor-body{display:flex;min-height:0}
.lr-note-source{width:100%;min-height:60vh;padding:14px 16px;border:1px solid var(--lr-line);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:calc(11.5px * var(--lr-fs,1));line-height:1.72;resize:vertical;tab-size:2}
.lr-note-source:focus{outline:2px solid color-mix(in srgb,var(--lr-accent) 34%,transparent);outline-offset:1px;border-color:color-mix(in srgb,var(--lr-accent) 34%,var(--lr-line))}
/* Insert-image dialog */
.lr-note-insert{display:flex;flex-direction:column;gap:11px}
.lr-note-tabs{display:flex;gap:3px;padding:3px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 7%,transparent);border:1px solid var(--lr-line)}
.lr-note-tabs .lr-note-tab{flex:1 1 0;justify-content:center;height:26px}
.lr-note-upload{display:flex;flex-direction:column;gap:9px;align-items:flex-start}
.lr-note-upload-pick{position:relative;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px dashed color-mix(in srgb,var(--lr-accent) 34%,var(--lr-line));border-radius:8px;background:color-mix(in srgb,var(--lr-accent) 6%,transparent);color:color-mix(in srgb,var(--lr-accent) 72%,var(--dsw-alias-label-primary));font-size:11.5px;font-weight:550;cursor:pointer}
.lr-note-upload-pick:hover{background:color-mix(in srgb,var(--lr-accent) 12%,transparent)}
.lr-note-upload-preview{max-width:100%;max-height:230px;border:1px solid var(--lr-line);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
.lr-note-crop{display:flex;flex-direction:column;gap:8px}
.lr-note-crop-bar{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.lr-note-crop-page{font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}
.lr-note-crop-hint{font-size:10px;color:var(--dsw-alias-label-secondary);margin-left:auto}
.lr-note-crop-stage{position:relative;align-self:center;max-width:100%;max-height:46vh;overflow:auto;border:1px solid var(--lr-line);border-radius:9px;background:var(--dsw-alias-bg-layer-1);touch-action:none;display:flex}
.lr-note-crop-stage img{max-width:100%;max-height:46vh;user-select:none;cursor:crosshair;object-fit:contain}
.lr-note-crop-box{position:absolute;border:1.5px solid color-mix(in srgb,var(--lr-accent) 80%,#fff);background:color-mix(in srgb,var(--lr-accent) 18%,transparent);border-radius:2px;pointer-events:none;box-shadow:0 0 0 1px color-mix(in srgb,#fff 50%,transparent) inset}
.lr-note-crop-box.locked{border-style:solid;background:color-mix(in srgb,var(--lr-accent) 12%,transparent)}
.lr-note-crop-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent);font-size:11px;color:var(--dsw-alias-label-secondary)}
.lr-note-crop-result{display:flex;align-items:center;gap:9px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.lr-note-crop-result img{max-height:74px;border:1px solid var(--lr-line);border-radius:7px}
.lr-note-insert-input{width:100%;height:30px;padding:0 10px;border:1px solid var(--lr-line);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px}
.lr-note-insert-input:focus{outline:2px solid color-mix(in srgb,var(--lr-accent) 38%,transparent);outline-offset:1px}
.lr-note-pos{display:inline-flex;gap:3px;padding:2px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 7%,transparent);border:1px solid var(--lr-line);flex-wrap:wrap}
.lr-note-pos-btn{height:22px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:10.5px;cursor:pointer;white-space:nowrap}
.lr-note-pos-btn:hover{color:var(--dsw-alias-label-primary)}
.lr-note-pos-btn.active{background:var(--dsw-alias-bg-base);color:color-mix(in srgb,var(--lr-accent) 74%,var(--dsw-alias-label-primary));font-weight:600;box-shadow:0 1px 2px color-mix(in srgb,#000 12%,transparent)}
.lr-note-section-select{width:100%;max-width:none}
.lr-note-cursor-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);line-height:1.55}
/* needs_question state */
.lr-note-question{display:flex;flex-direction:column;gap:10px}
.lr-note-question-badge{align-self:flex-start;padding:2px 7px;border-radius:6px;background:color-mix(in srgb,var(--lr-accent) 12%,transparent);color:color-mix(in srgb,var(--lr-accent) 74%,var(--dsw-alias-label-primary));font-size:10px;font-weight:600}
.lr-note-question-text{padding:10px 12px;border-left:2.5px solid color-mix(in srgb,var(--lr-accent) 44%,var(--lr-line));border-radius:0 8px 8px 0;background:color-mix(in srgb,var(--lr-accent) 6%,var(--dsw-alias-bg-layer-1));font-size:12px;line-height:1.68}
.lr-note-question-suggest{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6}
/* Figure progress */
.lr-note-progress{display:flex;align-items:center;gap:8px;padding:7px 14px;border-top:1px solid var(--lr-line);background:color-mix(in srgb,var(--lr-accent) 7%,var(--dsw-alias-bg-layer-1));font-size:11px;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.lr-note-progress-count{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600;color:var(--dsw-alias-label-primary)}
/* History drawer */
/* Above the narrow full-page editor (120) so the sheet is layered by z-index
   rather than by DOM order — reordering the siblings must not sink it. */
.lr-note-history-mask{position:fixed;inset:0;z-index:130;display:flex;justify-content:flex-end;background:color-mix(in srgb,#000 32%,transparent);animation:lr-fade .16s ease}
/* Modals opened from the narrow full-page editor (120) must sit above it. */
.lr-modal-backdrop.elevated{z-index:130}
.lr-note-history{display:flex;flex-direction:column;width:min(400px,92vw);height:100%;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-18px 0 44px color-mix(in srgb,#000 26%,transparent);animation:lr-slide-right .2s ease}
.lr-note-history-head{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid var(--lr-line);color:var(--dsw-alias-label-secondary)}
.lr-note-history-title{flex:1 1 auto;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.lr-note-history-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px}
.lr-note-history-empty{display:flex;flex-direction:column;align-items:center;gap:7px;padding:44px 18px;color:var(--dsw-alias-label-secondary);font-size:11px;text-align:center}
.lr-note-history-row{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid transparent;border-radius:9px}
.lr-note-history-row:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--lr-line)}
.lr-note-history-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}
.lr-note-history-time{font-size:11.5px;font-weight:550;color:var(--dsw-alias-label-primary)}
.lr-note-history-meta{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dsw-alias-label-secondary)}
.lr-note-history-tag{padding:1px 6px;border-radius:5px;background:color-mix(in srgb,var(--lr-accent) 10%,transparent);color:color-mix(in srgb,var(--lr-accent) 70%,var(--dsw-alias-label-secondary));font-weight:600}
.lr-note-preview{display:flex;flex-direction:column;gap:10px}
.lr-note-preview-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--lr-line)}
.lr-note-preview-note{margin-right:auto;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.lr-note-history-actions{display:flex;gap:4px;flex:0 0 auto}
/* Lightbox */
.lr-note-lightbox{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;padding:32px;background:color-mix(in srgb,#000 76%,transparent);animation:lr-fade .16s ease;cursor:zoom-out}
.lr-note-lightbox img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 24px 70px color-mix(in srgb,#000 55%,transparent);cursor:default}
.lr-note-lightbox-close{position:absolute;top:16px;right:16px;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid color-mix(in srgb,#fff 26%,transparent);border-radius:9px;background:color-mix(in srgb,#000 42%,transparent);color:#fff;cursor:pointer}
.lr-note-lightbox-close:hover{background:color-mix(in srgb,#000 62%,transparent)}
@keyframes lr-slide-right{from{transform:translateX(22px);opacity:.4}to{transform:none;opacity:1}}
@media(max-width:1100px){
  .lr-ann-panel{position:absolute;right:0;bottom:0;top:0;z-index:20;width:min(320px,86vw);flex-basis:auto;box-shadow:-14px 0 34px color-mix(in srgb,#000 20%,transparent);background:var(--dsw-alias-bg-layer-1)}
  .lr-note-stage{position:relative}
  .lr-note-head{gap:7px;padding:8px 11px}
  .lr-note-head-name{font-size:12px}
  .lr-note-applybar-hint{display:none}
  .lr-note-paper-wrap{padding:18px 18px 80px}
}
@media(max-width:900px){
  .lr-note-btn-label{display:none}
  .lr-note-head-actions .lr-btn.small{width:26px;padding:0}
  .lr-note-head-actions .lr-btn.small svg{width:13px;height:13px}
  .lr-note-head-actions .lr-btn{padding:0 8px}
  .lr-note-applybar{gap:7px;padding:7px 10px}
  .lr-note-applybar-input{flex-basis:100%;order:3}
  .lr-note-apply-btn{order:2;margin-left:auto}
  .lr-note-paper-wrap{padding:14px 14px 74px}
  .lr-note-tabs .lr-note-tab{padding:0 8px}
  .lr-note-crop-hint{display:none}
}
@media(max-width:620px){
  .lr-note-head-meta{display:none}
  .lr-note-save-state{display:none}
  .lr-note-h1{font-size:calc(17px * var(--lr-fs,1))}
  .lr-note-h2{font-size:calc(14.5px * var(--lr-fs,1))}
  .lr-note-applybar-count{font-size:10.5px}
}


/* ── Reader note (docs/reader-note-spec.md §7) ───────────────────────────────
   The record panel is a flex sibling of the split pane, so opening it
   shortens the split instead of covering the PDF or the chat. */
.lr-note-entry{position:relative}
.lr-note-entry-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 26%,transparent);color:var(--dsw-alias-label-primary);font-size:10px;font-weight:600;line-height:1}
.lr-note-dock{position:relative;flex:0 0 auto;display:flex;flex-direction:column;min-height:0;width:100%;border-top:1px solid var(--lr-line,var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.lr-note-dock-resize{position:absolute;top:-4px;left:0;right:0;height:9px;display:flex;align-items:center;justify-content:center;cursor:row-resize;touch-action:none;z-index:2}
.lr-note-dock-grip{width:46px;height:3px;border-radius:2px;background:var(--dsw-alias-border-l2);transition:background .15s ease}
.lr-note-dock-resize:hover .lr-note-dock-grip{background:var(--lr-accent,var(--dsw-alias-brand-primary))}
.lr-note-dock-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 12px 6px;min-height:36px}
.lr-note-dock-title{font-size:12.5px;font-weight:650;line-height:1.3}
.lr-note-dock-hint{font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lr-note-dock-spacer{flex:1 1 auto}
.lr-note-dock-tools{flex:0 0 auto;display:flex;align-items:center;gap:3px;flex-wrap:wrap;padding:0 12px 7px}
.lr-note-dock-tool{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 6px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;font-weight:600;line-height:1;cursor:pointer;transition:background .14s ease,color .14s ease,border-color .14s ease}
.lr-note-dock-tool:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary)}
.lr-note-dock-tool.is-strong{font-weight:800}
.lr-note-dock-tool.is-italic{font-style:italic;font-family:Georgia,serif}
.lr-note-dock-tool:disabled{opacity:.45;cursor:default}
.lr-note-dock-sep{width:1px;height:16px;margin:0 4px;background:var(--dsw-alias-border-l1)}
.lr-note-dock-font{display:flex;align-items:center;gap:1px;margin-left:2px}
.lr-note-dock-font-value{min-width:42px;height:26px;padding:0 4px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;font-variant-numeric:tabular-nums;cursor:pointer}
.lr-note-dock-font-value:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary)}
.lr-note-dock-modes{display:flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--lr-line,var(--dsw-alias-border-l1));border-radius:8px}
.lr-note-dock-mode{height:22px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;cursor:pointer;transition:background .14s ease,color .14s ease}
.lr-note-dock-mode.active{background:color-mix(in srgb,var(--lr-accent,var(--dsw-alias-brand-primary)) 14%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}
.lr-note-dock-body{flex:1 1 auto;display:flex;min-height:0;gap:0;border-top:1px solid var(--lr-line,var(--dsw-alias-border-l1))}
.lr-note-dock-input{flex:1 1 50%;min-width:0;min-height:0;resize:none;padding:10px 13px 14px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.65;outline:none;overflow:auto;tab-size:2}
.lr-note-dock-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.lr-note-dock-preview{flex:1 1 50%;min-width:0;min-height:0;padding:10px 15px 16px;border-left:1px solid var(--lr-line,var(--dsw-alias-border-l1));line-height:1.7;overflow:auto}
.lr-note-dock-body.preview-only .lr-note-dock-input{display:none}
.lr-note-dock-body.preview-only .lr-note-dock-preview{flex-basis:100%;border-left:0}
.lr-note-dock-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.lr-note-dock-preview .lr-note-h{margin:10px 0 6px}
.lr-note-dock-preview .lr-note-p{margin:0 0 8px}
.lr-note-dock-preview .lr-note-doc-list{margin:0 0 8px;padding-left:20px}
.lr-note-dock-preview .lr-note-pre{margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:.92em;overflow:auto}
.lr-note-dock-preview .lr-note-quote{margin:0 0 8px;padding:2px 0 2px 10px;border-left:2px solid var(--lr-line,var(--dsw-alias-border-l1));color:var(--dsw-alias-label-secondary)}
.lr-note-dock-preview .lr-note-table-wrap{margin:0 0 8px;overflow:auto}
.lr-note-dock-preview .lr-note-code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-size:.92em}
.lr-note-dock-preview .lr-note-figure{margin:0 0 8px}
.lr-note-dock-preview .lr-note-figure img{max-width:100%;border-radius:8px}
.lr-note-dock-preview .lr-note-hr{margin:10px 0;border:0;border-top:1px solid var(--dsw-alias-border-l1)}
.lr-note-dock-foot{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px 9px;border-top:1px solid var(--lr-line,var(--dsw-alias-border-l1))}
.lr-note-dock-words{font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.lr-note-dock-kbd{margin-left:4px;padding:1px 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;font-family:inherit;font-size:9.5px;color:var(--dsw-alias-label-tertiary)}
.lr-note-dock-help{flex:0 1 auto;max-height:96px;overflow:auto;padding:0 12px 7px;font-size:10.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.lr-note-dock-help-title{padding-bottom:3px;font-weight:600;color:var(--dsw-alias-label-primary)}
.lr-note-dock-help-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0 16px}
.lr-note-dock-help-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lr-note-dock-help-row kbd{padding:0 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;font-family:inherit;font-size:9.5px;color:var(--dsw-alias-label-tertiary)}
/* Narrow screens: a full-page editor over the plugin panel (spec §14.1). It is
   not a drawer and not an overlay card — it replaces the reader surface. */
.lr-note-dock-full{position:fixed;inset:0;z-index:120;height:auto!important;border-top:0;background:var(--dsw-alias-bg-base);border-radius:0}
@supports (height: 100dvh){.lr-note-dock-full{height:100dvh!important}}
.lr-note-dock-full .lr-note-dock-body.full{flex-direction:column}
.lr-note-dock-full .lr-note-dock-input{flex:1 1 auto;border-left:0}
.lr-note-dock-full .lr-note-dock-preview{flex:1 1 auto;border-left:0}
/* Maths (spec §7.4): no library, so the layout is plain CSS. */
.lr-math{line-height:1.7}
.lr-math-inline{display:inline-flex;align-items:center;vertical-align:middle}
.lr-math-display{display:block;text-align:center;padding:6px 0;overflow-x:auto}
.lr-math-holder{display:inline-flex;align-items:center;vertical-align:middle}
.lr-math-holder.is-display{display:block}
.lr-note-math-block{display:block;margin:8px 0;padding:6px 0;text-align:center;overflow-x:auto}
.lr-math-frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 .18em;font-size:.94em;line-height:1.15}
.lr-math-num{padding:0 .18em}
.lr-math-den{padding:0 .18em;border-top:1px solid currentColor}
.lr-math-sqrt{display:inline-flex;align-items:flex-start;margin:0 .1em}
.lr-math-radical{line-height:1}
.lr-math-sqrt-body{border-top:1px solid currentColor;padding:0 .12em;line-height:1.15}
.lr-math-sqrt-index{font-size:.68em;line-height:1;transform:translateY(-.15em)}
.lr-math-script{display:inline-flex;align-items:baseline}
.lr-math-sub,.lr-math-sup{font-size:.7em;line-height:0}
.lr-math-func{font-style:italic;margin-right:.08em}
.lr-math-text{font-style:normal}
/* An unknown command stays visible instead of silently disappearing. */
.lr-math-unknown{padding:0 3px;border-radius:3px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
/* 「整理笔记」 badge + the suspicious-finding dialog. */
.lr-note-organize{position:relative;gap:5px}
.lr-note-organize-badge{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent);font-size:9.5px;font-weight:700;line-height:1}
.lr-note-questions{display:flex;flex-direction:column;gap:10px}
.lr-note-questions-empty{display:flex;align-items:center;gap:8px;padding:14px;border:1px solid var(--lr-line,var(--dsw-alias-border-l1));border-radius:10px;color:var(--dsw-alias-label-secondary);font-size:12px}
.lr-note-question{padding:12px;border:1px solid var(--lr-line,var(--dsw-alias-border-l1));border-radius:11px;background:var(--dsw-alias-bg-layer-1)}
.lr-note-question-quote{display:flex;align-items:flex-start;gap:6px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary)}
.lr-note-question-quote q{font-style:italic}
.lr-note-question-problem{margin-top:6px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.lr-note-question-ask{display:flex;gap:6px;margin-top:5px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-primary)}
.lr-note-question-label{flex:0 0 auto;font-weight:600;color:var(--dsw-alias-state-warn-primary)}
.lr-note-question-thread{margin-top:8px;display:flex;flex-direction:column;gap:5px;padding:7px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:11.5px;line-height:1.6}
.lr-note-question-msg.user{color:var(--dsw-alias-label-primary);font-weight:600}
.lr-note-question-msg.ai{color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.lr-note-question-input{width:100%;min-height:56px;margin-top:8px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11.5px;line-height:1.6;resize:vertical}
.lr-note-question-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
.lr-note-questions-foot{display:flex;align-items:center;padding-top:2px}
/* Library: one row per paper with an expandable 三件套 panel (spec §12.4). */
.lr-pdf-expand{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;margin-top:2px;padding:3px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:10.5px;cursor:pointer;transition:background .14s ease,color .14s ease}
.lr-pdf-expand:hover,.lr-pdf-expand.open{background:color-mix(in srgb,var(--lr-accent,var(--dsw-alias-brand-primary)) 9%,transparent);color:var(--dsw-alias-label-primary)}
.lr-pdf-trio{display:flex;flex-direction:column;gap:5px;margin-top:2px;padding:8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:9px;background:color-mix(in srgb,var(--lr-accent,var(--dsw-alias-brand-primary)) 3%,transparent)}
.lr-pdf-trio .lr-btn{justify-content:flex-start}
.lr-reader-note-pill{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:8px;border:1px solid color-mix(in srgb,var(--lr-teal,#0d9488) 40%,transparent);background:color-mix(in srgb,var(--lr-teal,#0d9488) 13%,transparent);color:var(--lr-teal,#0d9488);font-size:9.5px;font-weight:600;line-height:1;white-space:nowrap}
.lr-standalone-pill{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:9.5px;line-height:1;white-space:nowrap}
.lr-note-scope{display:flex;align-items:center;gap:7px;margin-bottom:2px;padding:2px;font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.lr-note-scope input{width:13px;height:13px;accent-color:var(--lr-accent,var(--dsw-alias-brand-primary));cursor:pointer}
/* Delete dialog: keep / summary / all (spec §12.3). */
.lr-delete-choice{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.lr-delete-choice-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.lr-delete-option{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;cursor:pointer;transition:border-color .14s ease,background .14s ease}
.lr-delete-option:hover{border-color:var(--dsw-alias-border-l2)}
.lr-delete-option.checked{border-color:color-mix(in srgb,var(--lr-accent,var(--dsw-alias-brand-primary)) 52%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--lr-accent,var(--dsw-alias-brand-primary)) 7%,transparent)}
.lr-delete-option input{flex:0 0 auto;margin-top:2px;width:14px;height:14px;accent-color:var(--lr-accent,var(--dsw-alias-brand-primary));cursor:pointer}
.lr-delete-option-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.lr-delete-option-label{font-size:12px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.lr-delete-option-desc{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-secondary)}
@media(max-width:900px){
  /* Below 900px the editor and the preview stack instead of splitting. */
  .lr-note-dock-body{flex-direction:column}
  .lr-note-dock-preview{border-left:0;border-top:1px solid var(--lr-line,var(--dsw-alias-border-l1))}
  .lr-note-dock:not(.lr-note-dock-full) .lr-note-dock-body{flex-direction:column}
  .lr-note-dock:not(.lr-note-dock-full) .lr-note-dock-input{flex:1 1 auto}
  .lr-note-dock:not(.lr-note-dock-full) .lr-note-dock-preview{flex:1 1 auto}
}
@media(max-width:860px){
  .lr-note-entry .lr-label{display:none}
  .lr-note-dock-full .lr-note-dock-hint{display:none}
  .lr-note-dock-full .lr-note-dock-body{flex-direction:column}
  .lr-note-dock-full .lr-note-dock-input,.lr-note-dock-full .lr-note-dock-preview{flex:1 1 auto}
}
`

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        layoutService = ctx.layout
        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              zh,
              en,
            }),
          'literature-reader: locale',
        )
        t = ctx.locale.bind(NS)
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'literature-reader',
              locale: NS,
            },
            LiteratureReader,
          ),
        )
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'literature-reader',
              order: 20,
              locale: NS,
              label: () => t('panel'),
            },
            PanelIcon,
          ),
        )
      },
    }
  },
})
