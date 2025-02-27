/*!
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, {
  useRef, useState, useEffect, useMemo,
} from 'react';
import {
  Text,
  Box,
  Flex,
  Divider,
  Code,
  Button,
  Checkbox,
} from '@chakra-ui/react';

import { getMetaValue } from 'src/utils';
import useTaskLog from 'src/api/useTaskLog';
import LinkButton from 'src/components/LinkButton';
import { useTimezone } from 'src/context/timezone';
import type { Dag, DagRun, TaskInstance } from 'src/types';
import MultiSelect from 'src/components/MultiSelect';

import LogLink from './LogLink';
import { LogLevel, logLevelColorMapping, parseLogs } from './utils';

interface LogLevelOption {
  label: LogLevel;
  value: LogLevel;
  color: string;
}

interface FileSourceOption {
  label: string;
  value: string;
}

const showExternalLogRedirect = getMetaValue('show_external_log_redirect') === 'True';
const externalLogName = getMetaValue('external_log_name');
const logUrl = getMetaValue('log_url');

const getLinkIndexes = (tryNumber: number | undefined): Array<Array<number>> => {
  const internalIndexes: Array<number> = [];
  const externalIndexes: Array<number> = [];

  if (tryNumber) {
    [...Array(tryNumber + 1 || 0)].forEach((_, index) => {
      if (index === 0 && tryNumber < 2) return;
      const isExternal = index !== 0 && showExternalLogRedirect;
      if (isExternal) {
        externalIndexes.push(index);
      } else {
        internalIndexes.push(index);
      }
    });
  }

  return [internalIndexes, externalIndexes];
};

const logLevelOptions: Array<LogLevelOption> = Object.values(LogLevel).map(
  (value): LogLevelOption => ({
    label: value, value, color: logLevelColorMapping[value],
  }),
);

interface Props {
  dagId: Dag['id'];
  dagRunId: DagRun['runId'];
  taskId: TaskInstance['taskId'];
  mapIndex?: TaskInstance['mapIndex'];
  executionDate: DagRun['executionDate'];
  tryNumber: TaskInstance['tryNumber'];
}

const Logs = ({
  dagId,
  dagRunId,
  taskId,
  mapIndex,
  executionDate,
  tryNumber,
}: Props) => {
  const [internalIndexes, externalIndexes] = getLinkIndexes(tryNumber);
  const [selectedAttempt, setSelectedAttempt] = useState(1);
  const [shouldRequestFullContent, setShouldRequestFullContent] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [logLevelFilters, setLogLevelFilters] = useState<Array<LogLevelOption>>([]);
  const [fileSourceFilters, setFileSourceFilters] = useState<Array<FileSourceOption>>([]);
  const { timezone } = useTimezone();
  const { data, isSuccess } = useTaskLog({
    dagId,
    dagRunId,
    taskId,
    mapIndex,
    taskTryNumber: selectedAttempt,
    fullContent: shouldRequestFullContent,
  });

  const params = new URLSearchParams({
    task_id: taskId,
    execution_date: executionDate,
  });

  if (mapIndex !== undefined) {
    params.append('map_index', mapIndex.toString());
  }

  const { parsedLogs, fileSources = [] } = useMemo(
    () => parseLogs(
      data,
      timezone,
      logLevelFilters.map((option) => option.value),
      fileSourceFilters.map((option) => option.value),
    ),
    [data, fileSourceFilters, logLevelFilters, timezone],
  );

  const codeBlockBottomDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeBlockBottomDiv.current) {
      codeBlockBottomDiv.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [wrap, parsedLogs]);

  useEffect(() => {
    // Reset fileSourceFilters and selected attempt when changing to
    // a task that do not have those filters anymore.
    if (!internalIndexes.includes(selectedAttempt) && internalIndexes.length) {
      setSelectedAttempt(internalIndexes[0]);
    }

    if (data && fileSourceFilters.length > 0
      && fileSourceFilters.reduce(
        (isSourceMissing, option) => (isSourceMissing || !fileSources.includes(option.value)),
        false,
      )) {
      setFileSourceFilters([]);
    }
  }, [data, internalIndexes, fileSourceFilters, fileSources, selectedAttempt]);

  return (
    <>
      {tryNumber !== undefined && (
        <>
          <Text as="span"> (by attempts)</Text>
          <Flex my={1} justifyContent="space-between">
            <Flex flexWrap="wrap">
              {internalIndexes.map((index) => (
                <Button
                  key={index}
                  variant={selectedAttempt === index ? 'solid' : 'ghost'}
                  colorScheme="blue"
                  onClick={() => setSelectedAttempt(index)}
                  data-testid={`log-attempt-select-button-${index}`}
                >
                  {index}
                </Button>
              ))}
            </Flex>
          </Flex>
          <Flex my={1} justifyContent="space-between">
            <Flex alignItems="center" flexGrow={1} mr={10}>
              <Box width="100%" mr={2}>
                <MultiSelect
                  size="sm"
                  isMulti
                  options={logLevelOptions}
                  placeholder="All Levels"
                  value={logLevelFilters}
                  onChange={(options) => setLogLevelFilters([...options])}
                  chakraStyles={{
                    multiValue: (provided, ...rest) => ({
                      ...provided,
                      backgroundColor: rest[0].data.color,
                    }),
                    option: (provided, ...rest) => ({
                      ...provided,
                      borderLeft: 'solid 4px black',
                      borderColor: rest[0].data.color,
                      mt: 2,
                    }),
                  }}
                />
              </Box>
              <Box width="100%">
                <MultiSelect
                  size="sm"
                  isMulti
                  options={fileSources.map((fileSource) => ({
                    label: fileSource,
                    value: fileSource,
                  }))}
                  placeholder="All File Sources"
                  value={fileSourceFilters}
                  onChange={(options) => setFileSourceFilters([...options])}
                />
              </Box>
            </Flex>
            <Flex alignItems="center">
              <Checkbox
                onChange={() => setWrap((previousState) => !previousState)}
                px={4}
              >
                <Text as="strong">Wrap</Text>
              </Checkbox>
              <Checkbox
                onChange={() => setShouldRequestFullContent((previousState) => !previousState)}
                px={4}
                data-testid="full-content-checkbox"
              >
                <Text as="strong" whiteSpace="nowrap">Full Logs</Text>
              </Checkbox>
              <LogLink
                dagId={dagId}
                taskId={taskId}
                executionDate={executionDate}
                isInternal
                tryNumber={tryNumber}
                mapIndex={mapIndex}
              />
              <LinkButton
                href={`${logUrl}&${params.toString()}`}
              >
                See More
              </LinkButton>
            </Flex>
          </Flex>
          {
            isSuccess && (
              <Code
                height={350}
                overflowY="scroll"
                p={3}
                pb={0}
                display="block"
                whiteSpace={wrap ? 'pre-wrap' : 'pre'}
                border="1px solid"
                borderRadius={3}
                borderColor="blue.500"
              >
                {parsedLogs}
                <div ref={codeBlockBottomDiv} />
              </Code>
            )
          }
        </>
      )}
      {externalLogName && externalIndexes.length > 0 && (
        <>
          <Box>
            <Text>
              View Logs in
              {' '}
              {externalLogName}
              {' '}
              (by attempts):
            </Text>
            <Flex flexWrap="wrap">
              {
                externalIndexes.map(
                  (index) => (
                    <LogLink
                      key={index}
                      dagId={dagId}
                      taskId={taskId}
                      executionDate={executionDate}
                      tryNumber={index}
                    />
                  ),
                )
              }
            </Flex>
          </Box>
          <Divider my={2} />
        </>
      )}
    </>
  );
};

export default Logs;
