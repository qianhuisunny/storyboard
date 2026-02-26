/**
 * useChatState hook - 4-turn state machine for the chat flow
 */

import { useReducer, useCallback } from "react";
import type {
  BriefChatState,
  ChatAction,
  ChatTurn,
  TurnStatus,
  GapAnswers,
  GapQuestion,
  ResearchFindings,
  SearchEvent,
} from "../types";
import { createInitialChatState } from "../types";
import type { StoryBrief } from "../../types";

function chatReducer(state: BriefChatState, action: ChatAction): BriefChatState {
  switch (action.type) {
    case "SET_TURN":
      return { ...state, currentTurn: action.turn };

    case "SET_TURN_STATUS":
      return {
        ...state,
        turns: {
          ...state.turns,
          [action.turn]: { ...state.turns[action.turn], status: action.status },
        },
      };

    case "SET_CORRECTIONS":
      return {
        ...state,
        turns: {
          ...state.turns,
          [action.turn]: {
            ...state.turns[action.turn],
            corrections: action.corrections,
          },
        },
      };

    case "CONFIRM_TURN": {
      const nextTurn = (action.turn + 1) as ChatTurn;
      const newTurns = {
        ...state.turns,
        [action.turn]: {
          ...state.turns[action.turn],
          status: "confirmed" as TurnStatus,
          confirmedAt: new Date().toISOString(),
        },
      };

      // Set next turn to presenting if it exists
      if (nextTurn <= 4) {
        newTurns[nextTurn] = { ...newTurns[nextTurn], status: "presenting" };
      }

      return {
        ...state,
        currentTurn: nextTurn <= 4 ? nextTurn : state.currentTurn,
        turns: newTurns,
      };
    }

    case "START_RESEARCH":
      return {
        ...state,
        researchStatus: "running",
        searchEvents: [],
        researchFindings: null,
        error: undefined,
      };

    case "ADD_SEARCH_EVENT":
      return {
        ...state,
        searchEvents: [...state.searchEvents, action.event],
      };

    case "UPDATE_SEARCH_EVENT":
      return {
        ...state,
        searchEvents: state.searchEvents.map((event) =>
          event.id === action.id
            ? { ...event, status: action.status, resultsCount: action.resultsCount }
            : event
        ),
      };

    case "SET_RESEARCH_COMPLETE":
      return {
        ...state,
        researchStatus: "complete",
        researchFindings: action.findings,
        // Auto-advance turn 2 to presenting if turn 1 is confirmed
        turns:
          state.turns[1].status === "confirmed"
            ? { ...state.turns, 2: { ...state.turns[2], status: "presenting" } }
            : state.turns,
        currentTurn:
          state.turns[1].status === "confirmed" ? 2 : state.currentTurn,
      };

    case "SET_RESEARCH_ERROR":
      return {
        ...state,
        researchStatus: "error",
        error: action.error,
      };

    case "SET_GAP_QUESTIONS":
      return {
        ...state,
        gapQuestions: action.questions,
      };

    case "SET_GAP_ANSWERS":
      return {
        ...state,
        gapAnswers: action.answers,
      };

    case "SET_FINAL_BRIEF":
      return {
        ...state,
        finalBrief: action.brief,
        currentTurn: 4,
        turns: { ...state.turns, 4: { ...state.turns[4], status: "presenting" } },
      };

    case "RESET_RESEARCH":
      return {
        ...state,
        researchStatus: "idle",
        researchFindings: null,
        searchEvents: [],
        error: undefined,
      };

    default:
      return state;
  }
}

export function useChatState() {
  const [state, dispatch] = useReducer(chatReducer, undefined, createInitialChatState);

  const setTurn = useCallback((turn: ChatTurn) => {
    dispatch({ type: "SET_TURN", turn });
  }, []);

  const setTurnStatus = useCallback((turn: ChatTurn, status: TurnStatus) => {
    dispatch({ type: "SET_TURN_STATUS", turn, status });
  }, []);

  const confirmTurn = useCallback((turn: ChatTurn) => {
    dispatch({ type: "CONFIRM_TURN", turn });
  }, []);

  const setCorrections = useCallback((turn: ChatTurn, corrections: string) => {
    dispatch({ type: "SET_CORRECTIONS", turn, corrections });
    dispatch({ type: "SET_TURN_STATUS", turn, status: "correcting" });
  }, []);

  const startResearch = useCallback(() => {
    dispatch({ type: "START_RESEARCH" });
  }, []);

  const addSearchEvent = useCallback((event: SearchEvent) => {
    dispatch({ type: "ADD_SEARCH_EVENT", event });
  }, []);

  const updateSearchEvent = useCallback(
    (id: string, status: "complete" | "error", resultsCount?: number) => {
      dispatch({ type: "UPDATE_SEARCH_EVENT", id, status, resultsCount });
    },
    []
  );

  const setResearchComplete = useCallback((findings: ResearchFindings) => {
    dispatch({ type: "SET_RESEARCH_COMPLETE", findings });
  }, []);

  const setResearchError = useCallback((error: string) => {
    dispatch({ type: "SET_RESEARCH_ERROR", error });
  }, []);

  const setGapQuestions = useCallback((questions: GapQuestion[]) => {
    dispatch({ type: "SET_GAP_QUESTIONS", questions });
  }, []);

  const setGapAnswers = useCallback((answers: GapAnswers) => {
    dispatch({ type: "SET_GAP_ANSWERS", answers });
  }, []);

  const setFinalBrief = useCallback((brief: StoryBrief) => {
    dispatch({ type: "SET_FINAL_BRIEF", brief });
  }, []);

  const resetResearch = useCallback(() => {
    dispatch({ type: "RESET_RESEARCH" });
  }, []);

  return {
    state,
    setTurn,
    setTurnStatus,
    confirmTurn,
    setCorrections,
    startResearch,
    addSearchEvent,
    updateSearchEvent,
    setResearchComplete,
    setResearchError,
    setGapQuestions,
    setGapAnswers,
    setFinalBrief,
    resetResearch,
  };
}

export default useChatState;
