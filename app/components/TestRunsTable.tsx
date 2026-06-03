"use client";

import React, { useState } from "react";
import {
  Box,
  Table,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Flex,
  Menu,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";

const MotionBox = motion.create(Box);
import {
  CircleCheck,
  CircleX,
  TriangleAlert,
  ChevronDown,
  Terminal,
  RefreshCw,
  StopCircle,
  Trash2,
  X,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { getAWSColors, AWS_COLORS, getStatusStyle } from "@/app/theme/aws";
import { useThemeMode } from "@/app/providers";
import type { Run } from "@/src/types";

function formatDuration(createdAt: string, updatedAt: string): string {
  const start = new Date(createdAt).getTime();
  const end = new Date(updatedAt).getTime();
  const durationMs = Math.max(0, end - start);
  
  if (durationMs < 1000) return "< 1s";
  
  const totalSecs = Math.floor(durationMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

interface TestRunsTableProps {
  runs: Run[];
  selectedRunId: string | null;
  onSelectRun: (run: Run | null) => void;
  onStopRun: (runId: string) => void;
  onTerminateRun: (runId: string) => void | Promise<void>;
  onLaunchNew: () => void;
  isLoading: boolean;
  onRefresh: () => void;
  onViewReport: (run: Run) => void;
  cancellingMap?: Record<string, boolean>;
}

export function TestRunsTable({
  runs,
  selectedRunId,
  onSelectRun,
  onStopRun,
  onTerminateRun,
  onLaunchNew,
  isLoading,
  onRefresh,
  onViewReport,
  cancellingMap = {},
}: TestRunsTableProps) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const isSelectedRunning = selectedRun?.status === "running";
  const isCurrentlyCancelling = selectedRunId ? (cancellingMap?.[selectedRunId] ?? false) : false;
  const isStopEnabled = !!selectedRunId && isSelectedRunning && !isCurrentlyCancelling;

  const [terminateTarget, setTerminateTarget] = useState<Run | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  const handleConfirmTerminate = async () => {
    if (!terminateTarget) return;
    setIsTerminating(true);
    try {
      await Promise.all([
        onTerminateRun(terminateTarget.id),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      setTerminateTarget(null);
    } catch (err) {
      console.error("Failed to terminate run:", err);
    } finally {
      setIsTerminating(false);
    }
  };

  return (
    <Box
      bg={colors.cardBg}
      border="1px solid"
      borderColor={colors.border}
      borderRadius="xl"
      overflow="hidden"
      shadow="md"
    >
      {/* Table Actions Header */}
      <Flex
        px={4}
        py={2.5}
        bg={colors.subBg}
        borderBottom="1px solid"
        borderColor={colors.border}
        justify="space-between"
        align="center"
        wrap="wrap"
        gap={2}
      >
        <HStack gap={2}>
          <Text
            fontSize="12.5px"
            fontWeight="extrabold"
            color={colors.text}
            letterSpacing="0.05em"
          >
            TEST RUNS ({runs.length})
          </Text>
          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            color={colors.text}
            onClick={onRefresh}
            title="Refresh list"
            cursor="pointer"
            height="24px"
            px={2.5}
            borderRadius="md"
            _hover={{
              bg: colors.rowHover,
              borderColor: "var(--aws-orange-main)",
            }}
          >
            <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
          </Button>
        </HStack>

        <HStack gap={2}>
          {/* Launch test button */}
          <Button
            size="xs"
            bg="linear-gradient(135deg, var(--aws-orange-light) 0%, var(--aws-orange-main) 100%)"
            color={isDark ? "#232634" : "white"}
            fontWeight="bold"
            height="24px"
            px={3}
            cursor="pointer"
            border="none"
            borderRadius="md"
            boxShadow="0 2px 8px rgba(133, 193, 220, 0.25)"
            transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
            _hover={{
              bg: "linear-gradient(135deg, var(--aws-orange-light) 30%, var(--aws-orange-hover) 100%)",
              transform: "translateY(-1px)",
              boxShadow: "0 4px 12px rgba(133, 193, 220, 0.4)",
            }}
            _active={{
              transform: "translateY(0)",
              boxShadow: "0 2px 4px rgba(133, 193, 220, 0.2)",
            }}
            onClick={onLaunchNew}
          >
            <Plus size={11} style={{ marginRight: "4px" }} strokeWidth={2.5} />
            Launch tests
          </Button>

          {/* Stop Run button */}
          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            color={isStopEnabled ? colors.text : colors.subtext}
            disabled={!isStopEnabled}
            height="24px"
            px={3}
            borderRadius="md"
            cursor={isStopEnabled ? "pointer" : "not-allowed"}
            opacity={isStopEnabled || isCurrentlyCancelling ? 1 : 0.6}
            transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
            _hover={
              isStopEnabled
                ? {
                    bg: "rgba(239, 159, 118, 0.08)",
                    borderColor: "#ef9f76",
                    color: "#ef9f76",
                    transform: "translateY(-1px)",
                  }
                : {}
            }
            _active={isStopEnabled ? { transform: "translateY(0)" } : {}}
            onClick={() => {
              if (isStopEnabled && selectedRunId) {
                onStopRun(selectedRunId);
              }
            }}
          >
            {isCurrentlyCancelling ? (
              <>
                <RefreshCw size={11} className="animate-spin" style={{ marginRight: "4px" }} />
                Stopping...
              </>
            ) : (
              <>
                <StopCircle size={11} style={{ marginRight: "4px" }} />
                Stop Run
              </>
            )}
          </Button>

          {/* Terminate Run button */}
          <Button
            size="xs"
            variant="outline"
            borderColor={selectedRunId ? "red.500/30" : colors.border}
            color={selectedRunId ? "red.500" : colors.subtext}
            disabled={!selectedRunId}
            height="24px"
            px={3}
            borderRadius="md"
            cursor={selectedRunId ? "pointer" : "not-allowed"}
            opacity={selectedRunId ? 1 : 0.6}
            transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
            _hover={
              selectedRunId
                ? {
                    bg: "red.500/10",
                    borderColor: "red.500",
                    color: isDark ? "red.300" : "red.600",
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 12px rgba(231, 130, 132, 0.2)",
                  }
                : {}
            }
            _active={selectedRunId ? { transform: "translateY(0)" } : {}}
            onClick={() => {
              if (!selectedRunId) return;
              const target = runs.find((r) => r.id === selectedRunId);
              if (target) setTerminateTarget(target);
            }}
          >
            <Trash2 size={11} style={{ marginRight: "4px" }} />
            Terminate Run
          </Button>
        </HStack>
      </Flex>

      {/* Test Runs Grid Table */}
      <Box overflowX="auto">
        <Table.Root size="sm" variant="outline" border="none">
          <Table.Header bg={isDark ? "white/5" : "gray.50"}>
            <Table.Row borderColor={colors.border}>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
                w="40px"
                textAlign="center"
              >
                Select
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
              >
                Run ID
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
              >
                Name (Target URL)
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
              >
                Run State
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
              >
                Launch Time
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
              >
                Duration
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color={colors.subtext}
                fontSize="12px"
                py={2.5}
                w="110px"
              >
                Actions
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {runs.length === 0 ? (
              <Table.Row>
                <Table.Cell
                  colSpan={7}
                  textAlign="center"
                  py={8}
                  color={colors.subtext}
                  fontSize="13px"
                >
                  No test runs found. Launch a test to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              runs.map((run) => {
                const isSelected = selectedRunId === run.id;
                const statusStyle = getStatusStyle(run.status);
                const shortId = `i-${run.id.slice(0, 17)}`;

                // Status Checks details
                let checksText = "Initializing...";
                let checksColor = "yellow";
                if (run.status === "completed") {
                  checksText = "2/2 checks passed";
                  checksColor = "green";
                } else if (
                  run.status === "failed" ||
                  run.status === "cancelled"
                ) {
                  checksText = "Checks failed";
                  checksColor = "red";
                }

                // Alarm details
                const alarmsText =
                  run.status === "failed" ? "1 alarm" : "No alarms";

                return (
                  <Table.Row
                    key={run.id}
                    onClick={() => onSelectRun(isSelected ? null : run)}
                    bg={
                      isSelected
                        ? isDark
                          ? "rgba(133, 193, 220, 0.12)"
                          : "rgba(59, 130, 246, 0.08)"
                        : "transparent"
                    }
                    borderBottom="1px solid"
                    borderColor={colors.border}
                    cursor="pointer"
                    _hover={{ bg: isSelected ? undefined : colors.rowHover }}
                    transition="background-color 0.15s ease"
                  >
                    <Table.Cell py={2.5} textAlign="center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          onSelectRun(isSelected ? null : run);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "pointer" }}
                      />
                    </Table.Cell>
                    <Table.Cell
                      py={2.5}
                      fontWeight="semibold"
                      fontSize="13px"
                      color="var(--aws-orange-main)"
                      fontFamily="mono"
                    >
                      {shortId}
                    </Table.Cell>
                    <Table.Cell
                      py={2.5}
                      fontSize="13px"
                      color={colors.text}
                      fontWeight="medium"
                    >
                      {run.config.url}
                    </Table.Cell>
                    <Table.Cell py={2.5}>
                      <Badge
                        variant="subtle"
                        borderRadius="md"
                        fontSize="11px"
                        fontWeight="semibold"
                        display="inline-flex"
                        alignItems="center"
                        gap={1.5}
                        px={2}
                        py={0.5}
                        bg={statusStyle.bg}
                        color={
                          isDark ? statusStyle.darkColor : statusStyle.color
                        }
                        borderColor={statusStyle.border}
                        borderWidth="1px"
                      >
                        <Box
                          w="6px"
                          h="6px"
                          borderRadius="full"
                          bg={statusStyle.dotColor}
                          style={
                            statusStyle.animate
                              ? { animation: "pulse-glow-run 1.2s infinite" }
                              : {}
                          }
                        />
                        {statusStyle.label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell
                      py={2.5}
                      fontSize="13px"
                      color={colors.subtext}
                      fontFamily="mono"
                    >
                      {new Date(run.createdAt).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell
                      py={2.5}
                      fontSize="13px"
                      color={colors.subtext}
                      fontFamily="mono"
                    >
                      {formatDuration(run.createdAt, run.updatedAt)}
                    </Table.Cell>
                    <Table.Cell py={2} onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="xs"
                        variant="outline"
                        borderColor={colors.border}
                        color={colors.text}
                        disabled={
                          run.status !== "completed" &&
                          run.status !== "failed" &&
                          run.status !== "cancelled"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewReport(run);
                        }}
                        cursor={
                          run.status === "completed" ||
                          run.status === "failed" ||
                          run.status === "cancelled"
                            ? "pointer"
                            : "not-allowed"
                        }
                        opacity={
                          run.status === "completed" ||
                          run.status === "failed" ||
                          run.status === "cancelled"
                            ? 1
                            : 0.4
                        }
                        _hover={
                          run.status === "completed" ||
                          run.status === "failed" ||
                          run.status === "cancelled"
                            ? {
                                bg: colors.rowHover,
                                borderColor: "var(--aws-orange-main)",
                                color: "var(--aws-orange-main)",
                              }
                            : {}
                        }
                        fontSize="11px"
                        height="22px"
                        borderRadius="md"
                      >
                        View Report
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Internal Animation styles for status dots */}
      <style jsx global>{`
        @keyframes pulse-glow-run {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.3;
            transform: scale(0.7);
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>

      <TerminateRunDialog
        target={terminateTarget}
        isTerminating={isTerminating}
        onCancel={() => {
          if (!isTerminating) setTerminateTarget(null);
        }}
        onConfirm={handleConfirmTerminate}
        isDark={isDark}
        colors={colors}
      />
    </Box>
  );
}

interface TerminateRunDialogProps {
  target: Run | null;
  isTerminating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isDark: boolean;
  colors: ReturnType<typeof getAWSColors>;
}

function TerminateRunDialog({
  target,
  isTerminating,
  onCancel,
  onConfirm,
  isDark,
  colors,
}: TerminateRunDialogProps) {
  const isOpen = target !== null;
  const shortId = target ? `i-${target.id.slice(0, 17)}` : "";
  const statusStyle = target ? getStatusStyle(target.status) : null;

  const [termStep, setTermStep] = useState(0);

  const steps = [
    { text: "Processing termination request..." },
    { text: "Stopping active processes and closing browser sessions..." },
    { text: "Permanently deleting log files, workspace files, and run history..." },
  ];

  React.useEffect(() => {
    if (!isTerminating) {
      setTermStep(0);
      return;
    }
    const t1 = setTimeout(() => setTermStep(1), 650);
    const t2 = setTimeout(() => setTermStep(2), 1350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isTerminating]);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => {
        if (!e.open) onCancel();
      }}
      placement="center"
      motionPreset="scale"
      closeOnInteractOutside={!isTerminating}
      closeOnEscape={!isTerminating}
    >
      <Portal>
        <Dialog.Backdrop
          bg={isDark ? "rgba(0, 0, 0, 0.7)" : "rgba(15, 23, 42, 0.5)"}
        />
        <Dialog.Positioner>
          <Dialog.Content
            bg={colors.cardBg}
            color={colors.text}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="xl"
            maxW="520px"
            w="92vw"
            overflow="hidden"
            shadow="xl"
            p={0}
          >
            {isTerminating ? (
              <Box py={10} px={6} textAlign="center" bg={colors.cardBg}>
                <VStack gap={5} align="center">
                  {/* Glowing spinner graphic */}
                  <Box position="relative" w="72px" h="72px" display="flex" alignItems="center" justifyContent="center">
                    {/* Ring 1: outer fast spinner */}
                    <MotionBox
                      position="absolute"
                      w="72px"
                      h="72px"
                      borderRadius="full"
                      border="2px dashed"
                      borderColor="red.500"
                      opacity={0.6}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                    />
                    {/* Ring 2: middle slow reverse spinner */}
                    <MotionBox
                      position="absolute"
                      w="58px"
                      h="58px"
                      borderRadius="full"
                      border="1.5px dashed"
                      borderColor="orange.400"
                      opacity={0.4}
                      animate={{ rotate: -360 }}
                      transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
                    />
                    {/* Ring 3: inner pulsing glow */}
                    <MotionBox
                      position="absolute"
                      w="44px"
                      h="44px"
                      borderRadius="full"
                      bg="red.500/10"
                      animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.25, 0.6, 0.25] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {/* Danger Trash Icon */}
                    <MotionBox
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Trash2 size={20} color="#e78284" />
                    </MotionBox>
                  </Box>

                  {/* Processing Narrative text with slide up transitions */}
                  <VStack gap={1} minH="54px" justify="center">
                    <Text fontSize="13px" fontWeight="black" letterSpacing="0.05em" textTransform="uppercase" color="red.400">
                      Terminating Run
                    </Text>
                    
                    <Box h="36px" overflow="hidden" position="relative" w="100%" display="flex" justifyContent="center" alignItems="center">
                      <AnimatePresence mode="wait">
                        <MotionBox
                          key={termStep}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          fontSize="12px"
                          color={colors.subtext}
                          maxW="340px"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          {steps[termStep]?.text}
                        </MotionBox>
                      </AnimatePresence>
                    </Box>
                  </VStack>

                  {/* Progress Indicator Dots */}
                  <HStack gap={1.5}>
                    {steps.map((_, idx) => (
                      <MotionBox
                        key={idx}
                        w="5px"
                        h="5px"
                        borderRadius="full"
                        bg={idx === termStep ? "red.400" : (isDark ? "slate.700" : "slate.300")}
                        animate={idx === termStep ? { scale: [1, 1.3, 1] } : {}}
                        transition={{ duration: 1, repeat: idx === termStep ? Infinity : 0 }}
                      />
                    ))}
                  </HStack>
                </VStack>
              </Box>
            ) : (
              <>
                {/* Header bar */}
                <Flex
                  align="center"
                  gap={2.5}
                  px={5}
                  py={3}
                  bg="var(--aws-header-bg)"
                  borderBottom="2px solid"
                  borderColor="red.500"
                >
                  <Flex
                    w="22px"
                    h="22px"
                    bg="rgba(231, 130, 132, 0.18)"
                    border="1px solid rgba(231, 130, 132, 0.6)"
                    borderRadius="md"
                    align="center"
                    justify="center"
                  >
                    <AlertTriangle
                      size={13}
                      color={isDark ? "#e78284" : "#dc2626"}
                      strokeWidth={2.5}
                    />
                  </Flex>
                  <Dialog.Title flex={1}>
                    <Text
                      fontSize="13.5px"
                      fontWeight="bold"
                      color="var(--aws-header-text)"
                      letterSpacing="0.1px"
                    >
                      Terminate test run?
                    </Text>
                  </Dialog.Title>
                  <Button
                    variant="ghost"
                    size="xs"
                    px={1.5}
                    minW="22px"
                    h="22px"
                    color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"}
                    _hover={{
                      bg: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                      color: isDark ? "white" : "black",
                    }}
                    onClick={onCancel}
                    disabled={isTerminating}
                    aria-label="Close"
                  >
                    <X size={13} />
                  </Button>
                </Flex>

                {/* Body */}
                <Box px={5} py={4}>
                  <Text
                    fontSize="12.5px"
                    color={colors.text}
                    mb={3}
                    lineHeight="1.55"
                  >
                    Once a test run is terminated, all logs, generated specs, and
                    workspace files are{" "}
                    <Box as="span" fontWeight="bold">
                      permanently deleted
                    </Box>
                    . This action cannot be undone.
                  </Text>

                  {/* Run details */}
                  <Box
                    border="1px solid"
                    borderColor={colors.border}
                    borderRadius="lg"
                    bg={isDark ? "rgba(255,255,255,0.02)" : "#fafbfc"}
                    overflow="hidden"
                  >
                    <Flex
                      px={3}
                      py={1.5}
                      bg={isDark ? "rgba(255,255,255,0.04)" : "#f2f3f3"}
                      borderBottom="1px solid"
                      borderColor={colors.border}
                      align="center"
                      gap={1.5}
                    >
                      <Box
                        w="3px"
                        h="10px"
                        bg="var(--aws-orange-main)"
                        borderRadius="full"
                      />
                      <Text
                        fontSize="10px"
                        fontWeight="bold"
                        color={colors.subtext}
                        textTransform="uppercase"
                        letterSpacing="0.5px"
                      >
                        Test run details
                      </Text>
                    </Flex>

                    {target && (
                      <VStack align="stretch" gap={0} fontSize="11.5px">
                        <DialogRow label="Run ID" isDark={isDark} colors={colors}>
                          <Text
                            fontFamily="mono"
                            color="var(--aws-orange-main)"
                            fontWeight="semibold"
                          >
                            {shortId}
                          </Text>
                        </DialogRow>
                        <DialogRow
                          label="Target URL"
                          isDark={isDark}
                          colors={colors}
                        >
                          <Text
                            color={colors.text}
                            truncate
                            maxW="280px"
                            title={target.config.url}
                          >
                            {target.config.url}
                          </Text>
                        </DialogRow>
                        <DialogRow
                          label="State"
                          isDark={isDark}
                          colors={colors}
                          isLast
                        >
                          {statusStyle && (
                            <Badge
                              variant="subtle"
                              borderRadius="md"
                              fontSize="10.5px"
                              fontWeight="semibold"
                              display="inline-flex"
                              alignItems="center"
                              gap={1.5}
                              px={2}
                              py={0.5}
                              bg={statusStyle.bg}
                              color={
                                isDark ? statusStyle.darkColor : statusStyle.color
                              }
                              borderColor={statusStyle.border}
                              borderWidth="1px"
                            >
                              <Box
                                w="5px"
                                h="5px"
                                borderRadius="full"
                                bg={statusStyle.dotColor}
                              />
                              {statusStyle.label}
                            </Badge>
                          )}
                        </DialogRow>
                      </VStack>
                    )}
                  </Box>
                </Box>

                {/* Footer */}
                <Flex
                  px={5}
                  py={3}
                  bg={isDark ? "rgba(0,0,0,0.25)" : "#f8fafc"}
                  borderTop="1px solid"
                  borderColor={colors.border}
                  justify="flex-end"
                  gap={2}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    borderColor={colors.border}
                    color={colors.text}
                    bg="transparent"
                    _hover={{ bg: colors.rowHover }}
                    fontWeight="semibold"
                    fontSize="11.5px"
                    height="28px"
                    px={3.5}
                    onClick={onCancel}
                    disabled={isTerminating}
                    borderRadius="md"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    bg="#e78284"
                    color="#232634"
                    _hover={{ bg: "#ea999c" }}
                    _active={{ bg: "#e78284" }}
                    fontWeight="bold"
                    fontSize="11.5px"
                    height="28px"
                    px={3.5}
                    onClick={onConfirm}
                    disabled={isTerminating}
                    borderRadius="md"
                  >
                    {isTerminating ? (
                      <RefreshCw size={11} className="animate-spin" style={{ marginRight: "6px" }} />
                    ) : (
                      <Trash2 size={11} style={{ marginRight: "6px" }} />
                    )}
                    {isTerminating ? "Terminating..." : "Terminate"}
                  </Button>
                </Flex>
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function DialogRow({
  label,
  children,
  isDark,
  colors,
  isLast,
}: {
  label: string;
  children: React.ReactNode;
  isDark: boolean;
  colors: ReturnType<typeof getAWSColors>;
  isLast?: boolean;
}) {
  return (
    <Flex
      px={3}
      py={2}
      borderBottom={isLast ? "none" : "1px solid"}
      borderColor={colors.border}
      align="center"
      gap={3}
    >
      <Text
        flex="0 0 110px"
        color={colors.subtext}
        fontSize="10.5px"
        textTransform="uppercase"
        letterSpacing="0.4px"
        fontWeight="semibold"
      >
        {label}
      </Text>
      <Box flex={1} minW={0}>
        {children}
      </Box>
    </Flex>
  );
}
