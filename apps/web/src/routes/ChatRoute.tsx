import React, { lazy, useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";

const UnifiedWorkspace = lazy(() => import("../components/UnifiedWorkspace"));

export default function ChatRoute() {
  const { chatId } = useParams();
  const location = useLocation();
  const {
    currentMessages,
    setCurrentMessages,
    currentChatId,
    setCurrentChatId,
    chats,
    handleTrace,
    handleGoDeeper,
    handleShowVisualization,
    bibleStudyMode,
    setBibleStudyMode,
    handleNewChat,
    toolsUsed,
    setToolsUsed,
  } = useAppContext();

  // Handle pending prompt from location state (e.g., "Go Deeper" from reader)
  const [pendingPrompt, setPendingPrompt] = useState(
    location.state?.prompt || null,
  );

  // Load chat from history if navigating to a specific chatId
  useEffect(() => {
    if (chatId && chatId !== currentChatId) {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        setCurrentChatId(chatId);
        setCurrentMessages(chat.messages);
      }
    }
  }, [chatId, chats, currentChatId, setCurrentChatId, setCurrentMessages]);

  // Ensure Bible study mode when on chat route
  useEffect(() => {
    if (!bibleStudyMode) setBibleStudyMode(true);
  }, [bibleStudyMode, setBibleStudyMode]);

  return (
    <UnifiedWorkspace
      project={null}
      onCreateProject={() => {}}
      onInspireMe={() => {}}
      toolsUsed={toolsUsed}
      setToolsUsed={setToolsUsed}
      creating={false}
      inspiring={false}
      onRefreshProject={() => {}}
      messages={currentMessages}
      onMessagesChange={setCurrentMessages}
      pendingPrompt={pendingPrompt}
      onPromptConsumed={() => setPendingPrompt(null)}
      bibleStudyMode={bibleStudyMode}
      onExitBibleStudy={() => setBibleStudyMode(false)}
      onResetBibleStudy={() => {
        setBibleStudyMode(true);
        handleNewChat();
      }}
      onTrace={handleTrace}
      onGoDeeper={handleGoDeeper}
      onShowVisualization={handleShowVisualization}
    />
  );
}
